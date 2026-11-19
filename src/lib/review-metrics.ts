import { readFileSync } from "node:fs";
import path from "node:path";
import { and, count, desc, eq, gte, inArray, isNotNull, lte, min, ne, sum } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { aiCalls, ESCALATION_REASONS, matchingDecisions, problems, requests, type EscalationReason } from "@/db/schema";
import { appSpendToday, startOfUtcDay } from "@/lib/ai-controls";
import { aiDailyBudgetUsd } from "@/lib/config";

/**
 * The `/review` metrics (spec user stories 16–17, metrics ticket 07): pure queries over the
 * database, each returning its n so the page can show it and apply the "too few" rule.
 */

/** Windows and the "too few" threshold. */
export const REVIEW_METRICS = {
  /** PM agreement rate (and Escalation agreement) covers the last this-many reviewed decisions. */
  agreementWindow: 30,
  /** Escalation rate covers Matching decisions made in the last this-many days. */
  escalationRateDays: 7,
  /** Regression cases marked covers Match reviews in the last this-many days. */
  regressionDays: 30,
  /** Cost per Request covers Requests submitted in the last this-many days. */
  costPerRequestDays: 7,
  /** Below this n, a rate or average shows "too few" instead of a number. */
  minN: 10,
} as const;

/** A share: `count` of `n`, with `value` (count ÷ n) null when n is below `minN`. */
export type Rate = { n: number; count: number; value: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;

/** The start of a window of `days` ending at `now`; a time exactly `days` ago is inside. */
export function windowStart(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

function rate(count: number, n: number): Rate {
  return { n, count, value: n >= REVIEW_METRICS.minN ? count / n : null };
}

/** A share as shown: "80%", or "n = 4, too few" below `minN`. */
export function formatShare(share: Rate): string {
  return share.value === null ? tooFew(share.n) : `${Math.round(share.value * 100)}%`;
}

/** What a stat shows instead of a number when its n is below `minN`. */
export function tooFew(n: number): string {
  return `n = ${n}, too few`;
}

type ReviewedDecision = { verdict: string | null; matcherOutcome: string; reasons: EscalationReason[] | null };

/** Reviewed Matching decisions, newest review first. */
function reviewedNewestFirst(db: Db): ReviewedDecision[] {
  return db
    .select({
      verdict: matchingDecisions.verdict,
      matcherOutcome: matchingDecisions.matcherOutcome,
      reasons: matchingDecisions.escalationReasons,
    })
    .from(matchingDecisions)
    .where(and(isNotNull(matchingDecisions.verdict), isNotNull(matchingDecisions.reviewedAt)))
    .orderBy(desc(matchingDecisions.reviewedAt), desc(matchingDecisions.id))
    .all();
}

/** Bypassed decisions (the Matcher didn't answer) say nothing about the Matcher, so both agreement rates skip them. */
function isBypassed(d: ReviewedDecision): boolean {
  return d.matcherOutcome !== "ok" || (d.reasons ?? []).includes("bypassed");
}

function agreement(db: Db, include: (d: ReviewedDecision) => boolean): Rate {
  const window = reviewedNewestFirst(db)
    .filter((d) => !isBypassed(d) && include(d))
    .slice(0, REVIEW_METRICS.agreementWindow);
  return rate(window.filter((d) => d.verdict === "confirm").length, window.length);
}

/**
 * PM agreement rate: Confirms ÷ reviewed spot checks, over the last 30 reviewed spot checks.
 * Spot checks are a random sample of decisions that would otherwise be Auto-accepted, so they
 * measure the Matcher without the hard-case bias of the other Escalations.
 */
export function pmAgreementRate(db: Db): Rate {
  return agreement(db, (d) => (d.reasons ?? []).includes("spot_check"));
}

/**
 * Escalation agreement: the same measure over reviewed Escalations other than spot checks (the
 * hard cases), last 30. Read beside the PM agreement rate, not instead of it: Escalations are
 * hard by design, so this runs lower.
 */
export function escalationAgreementRate(db: Db): Rate {
  return agreement(db, (d) => (d.reasons ?? []).some((r) => r !== "spot_check"));
}

export type EscalationRate = Rate & {
  /** How many of the window's decisions had each reason (a decision can have several), strongest first. */
  reasons: { reason: EscalationReason; count: number }[];
};

/**
 * Escalation rate: escalated ÷ all Matching decisions made in the last 7 days, with a per-reason
 * breakdown. Decisions whose reasons haven't been computed yet (before the backfill) are skipped.
 */
export function escalationRate(db: Db, now: Date): EscalationRate {
  const rows = db
    .select({ reasons: matchingDecisions.escalationReasons })
    .from(matchingDecisions)
    .where(
      and(
        gte(matchingDecisions.createdAt, windowStart(now, REVIEW_METRICS.escalationRateDays)),
        lte(matchingDecisions.createdAt, now),
        isNotNull(matchingDecisions.escalationReasons),
      ),
    )
    .all();
  const reasonLists = rows.map((r) => r.reasons ?? []);
  const reasons = ESCALATION_REASONS.map((reason) => ({
    reason,
    count: reasonLists.filter((list) => list.includes(reason)).length,
  })).filter((r) => r.count > 0);
  return { ...rate(reasonLists.filter((list) => list.length > 0).length, reasonLists.length), reasons };
}

/**
 * Regression cases marked: Match reviews in the last 30 days that the PM marked as a Regression
 * case. The mark is set with the review, so its review time is when it was marked. "Marked", not
 * "added": the app can't see whether `npm run eval:pull` exported it or anyone committed it.
 */
export function regressionCasesMarked(db: Db, now: Date): number {
  return (
    db
      .select({ n: count() })
      .from(matchingDecisions)
      .where(
        and(
          eq(matchingDecisions.regressionCase, true),
          gte(matchingDecisions.reviewedAt, windowStart(now, REVIEW_METRICS.regressionDays)),
          lte(matchingDecisions.reviewedAt, now),
        ),
      )
      .get()?.n ?? 0
  );
}

/** Today's (UTC) app AI spend against the daily budget, or `ok: false` if the budget is misconfigured. */
export type SpendToday = { ok: true; spentUsd: number; budgetUsd: number } | { ok: false };

export function spendToday(db: Db, now: Date): SpendToday {
  let budgetUsd: number;
  try {
    budgetUsd = aiDailyBudgetUsd();
  } catch {
    return { ok: false };
  }
  return { ok: true, spentUsd: appSpendToday(db, now), budgetUsd };
}

/** App AI calls refused today (UTC), never sent: over budget, and switched off. */
export function refusalsToday(db: Db, now: Date): { budget: number; off: number } {
  const start = startOfUtcDay(now);
  const rows = db
    .select({ outcome: aiCalls.outcome, n: count() })
    .from(aiCalls)
    .where(
      and(
        eq(aiCalls.source, "app"),
        inArray(aiCalls.outcome, ["refused_budget", "refused_off"]),
        gte(aiCalls.time, start),
        lte(aiCalls.time, new Date(start.getTime() + DAY_MS - 1)),
      ),
    )
    .groupBy(aiCalls.outcome)
    .all();
  const of = (outcome: string) => rows.find((r) => r.outcome === outcome)?.n ?? 0;
  return { budget: of("refused_budget"), off: of("refused_off") };
}

/** Cost per Request: `totalUsd` over `n` Requests; `value` null when n is below `minN`. */
export type CostPerRequest = { n: number; totalUsd: number; value: number | null };

/**
 * Cost per Request: the Matcher and Evaluator AI calls for Requests submitted in the last 7 days,
 * ÷ those Requests. Calls from eval runs are left out; app and seed calls count.
 *
 * Attribution: a Matcher call relates to its Request (`related_type = 'request'`, linked when the
 * Request is saved), so it is counted directly. An Evaluator call relates to a Problem, not a
 * Request, so we count every Evaluator call made during the window on a Problem that one of those
 * Requests is on (each call once, however many of the Requests share the Problem). This over-counts
 * re-evaluations a PM ran for other reasons, and under-counts Matcher previews that were never
 * submitted (they stay unrelated) and Requests later moved off the Problem.
 */
export function costPerRequest(db: Db, now: Date): CostPerRequest {
  const start = windowStart(now, REVIEW_METRICS.costPerRequestDays);
  const recent = db
    .select({ id: requests.id, problemId: requests.problemId })
    .from(requests)
    .where(and(gte(requests.createdAt, start), lte(requests.createdAt, now)))
    .all();
  if (recent.length === 0) return { n: 0, totalUsd: 0, value: null };
  const total = (where: ReturnType<typeof and>) =>
    Number(db.select({ total: sum(aiCalls.costUsd) }).from(aiCalls).where(where).get()?.total ?? 0);
  const matcherUsd = total(
    and(
      eq(aiCalls.module, "matcher"),
      ne(aiCalls.source, "eval"),
      eq(aiCalls.relatedType, "request"),
      inArray(aiCalls.relatedId, recent.map((r) => r.id)),
    ),
  );
  const evaluatorUsd = total(
    and(
      eq(aiCalls.module, "evaluator"),
      ne(aiCalls.source, "eval"),
      eq(aiCalls.relatedType, "problem"),
      inArray(aiCalls.relatedId, [...new Set(recent.map((r) => r.problemId))]),
      gte(aiCalls.time, start),
      lte(aiCalls.time, now),
    ),
  );
  const totalUsd = matcherUsd + evaluatorUsd;
  const n = recent.length;
  return { n, totalUsd, value: n >= REVIEW_METRICS.minN ? totalUsd / n : null };
}

/** The last committed eval run's headline numbers. Eval, not production. */
export type EvalBaseline = { commit: string; date: Date; f1: number; caseAccuracy: number };

export const EVAL_BASELINE_PATH = path.join(process.cwd(), "evals", "baseline.json");

const baselineSchema = z.object({
  commit: z.string(),
  date: z.iso.datetime(),
  replay: z.object({ f1: z.number() }),
  caseScores: z.object({ accuracy: z.number() }),
});

/** The fields `/review` shows from a parsed `evals/baseline.json`, or null if it doesn't have them. */
export function parseEvalBaseline(raw: unknown): EvalBaseline | null {
  const parsed = baselineSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { commit, date, replay, caseScores } = parsed.data;
  return { commit, date: new Date(date), f1: replay.f1, caseAccuracy: caseScores.accuracy };
}

/**
 * Read the committed eval baseline at request time (not bundled, so the page still renders if the
 * file is missing or malformed: null).
 */
export function readEvalBaseline(file = EVAL_BASELINE_PATH): EvalBaseline | null {
  try {
    return parseEvalBaseline(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

/**
 * Time to decision: over `n` decided (non-Open) Problems with a decision time, the median days
 * from the first Request to it; null when n is below `minN`. `decided` counts every non-Open
 * Problem.
 */
export type TimeToDecision = { n: number; medianDays: number | null; decided: number };

/**
 * Time to decision: the median days from a Problem's first Request to its first non-Open Status.
 *
 * Proxy: there's no Status history (a Status change overwrites `problems.status`, with no
 * timestamp), so a Problem's decision time is its first Decision-note draft, the earliest
 * `decision_note` AI call related to it (any outcome; a PM drafts the note while changing Status).
 * Only Problems that are non-Open now and have such a call are timed; a decision made without a
 * draft isn't, and a draft made for a later Status change overstates the time.
 */
export function timeToDecision(db: Db): TimeToDecision {
  const decided = db
    .select({ id: problems.id })
    .from(problems)
    .where(ne(problems.status, "open"))
    .all()
    .map((p) => p.id);
  if (decided.length === 0) return { n: 0, medianDays: null, decided: 0 };
  const firstRequest = new Map(
    db
      .select({ problemId: requests.problemId, at: min(requests.createdAt) })
      .from(requests)
      .where(inArray(requests.problemId, decided))
      .groupBy(requests.problemId)
      .all()
      .map((r) => [r.problemId, r.at]),
  );
  const firstDraft = db
    .select({ problemId: aiCalls.relatedId, at: min(aiCalls.time) })
    .from(aiCalls)
    .where(
      and(
        eq(aiCalls.module, "decision_note"),
        ne(aiCalls.source, "eval"),
        eq(aiCalls.relatedType, "problem"),
        inArray(aiCalls.relatedId, decided),
      ),
    )
    .groupBy(aiCalls.relatedId)
    .all();
  const days = firstDraft.flatMap(({ problemId, at }) => {
    const first = problemId === null ? undefined : firstRequest.get(problemId);
    if (!first || !at) return [];
    return [Math.max(0, (new Date(at).getTime() - new Date(first).getTime()) / DAY_MS)];
  });
  return { n: days.length, medianDays: days.length >= REVIEW_METRICS.minN ? median(days) : null, decided: decided.length };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The share of non-Open Problems with a (non-blank) Decision note, over all of them. */
export function decisionNoteShare(db: Db): Rate {
  const notes = db
    .select({ note: problems.decisionNote })
    .from(problems)
    .where(ne(problems.status, "open"))
    .all();
  return rate(notes.filter((p) => p.note?.trim()).length, notes.length);
}

import { readFileSync } from "node:fs";
import path from "node:path";
import { and, count, eq, gte, inArray, isNotNull, isNull, lte, ne, sql, sum, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import {
  aiCalls,
  ESCALATION_REASONS,
  matchingDecisions,
  problems,
  requests,
  type AiCallOutcome,
  type EscalationReason,
  type MatcherOutcome,
  type Verdict,
} from "@/db/schema";
import { appSpendToday, onUtcDayOf } from "@/lib/ai-controls";
import { aiDailyBudgetUsd } from "@/lib/config";

/**
 * The `/review` metrics (build ticket 09; definitions in the metrics wayfinding ticket, spec user
 * stories 16–17): pure queries over the database, each returning its n so the page can show it
 * and apply the "too few" rule.
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

/** The "too few" rule: `value` for an n of at least `minN`, otherwise null. */
function ifEnough<T>(n: number, value: () => T): T | null {
  return n >= REVIEW_METRICS.minN ? value() : null;
}

function rate(count: number, n: number): Rate {
  return { n, count, value: ifEnough(n, () => count / n) };
}

/** A share as a whole percentage: "80%". */
export function formatPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** A share as shown: "80%", or "n = 4, too few" below `minN`. */
export function formatShare(share: Rate): string {
  return share.value === null ? tooFew(share.n) : formatPercent(share.value);
}

/** What a stat shows instead of a number when its n is below `minN`. */
export function tooFew(n: number): string {
  return `n = ${n}, too few`;
}

export type AgreementRates = {
  /** PM agreement rate: over reviewed spot checks. */
  spotCheck: Rate;
  /** Escalation agreement: over reviewed Escalations other than spot checks. */
  escalation: Rate;
};

/**
 * Both agreement rates, from one bounded query: Confirms ÷ reviewed decisions, over the last 30
 * reviewed (newest `reviewed_at` first) in each group.
 *
 * - **PM agreement rate** covers spot checks: a random sample of decisions that would otherwise be
 *   Auto-accepted, so it measures the Matcher without the hard-case bias of other Escalations.
 * - **Escalation agreement** is the same measure over Escalations other than spot checks (the hard
 *   cases), so it runs lower; read it beside the PM agreement rate, not instead of it.
 *
 * Bypassed decisions (the Matcher didn't answer: `matcher_outcome` isn't ok, or a `bypassed`
 * reason) say nothing about the Matcher, so both skip them. Auto-accepted decisions (no reasons)
 * a PM reviewed anyway, and decisions without computed reasons, are in neither.
 */
export function agreementRates(db: Db): AgreementRates {
  const rows = db.all<{ spotCheck: 0 | 1; verdict: Verdict }>(sql`
    select spot_check as spotCheck, verdict from (
      select
        d.verdict,
        exists (select 1 from json_each(d.escalation_reasons) where value = 'spot_check') as spot_check,
        row_number() over (
          partition by exists (select 1 from json_each(d.escalation_reasons) where value = 'spot_check')
          order by d.reviewed_at desc, d.id desc
        ) as position
      from ${matchingDecisions} d
      where d.verdict is not null
        and d.reviewed_at is not null
        and d.matcher_outcome = ${"ok" satisfies MatcherOutcome}
        and d.escalation_reasons is not null
        and json_array_length(d.escalation_reasons) > 0
        and not exists (select 1 from json_each(d.escalation_reasons) where value = ${"bypassed" satisfies EscalationReason})
    )
    where position <= ${REVIEW_METRICS.agreementWindow}
  `);
  const of = (spotCheck: boolean): Rate => {
    const group = rows.filter((r) => Boolean(r.spotCheck) === spotCheck);
    return rate(group.filter((r) => r.verdict === "confirm").length, group.length);
  };
  return { spotCheck: of(true), escalation: of(false) };
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

/** Regression cases marked, of `corrections` (Move and Split reviews) in the same window. */
export type RegressionCases = { marked: number; corrections: number };

/**
 * Regression cases marked: Match reviews in the last 30 days that the PM marked as a Regression
 * case, beside the Move and Split reviews in that window (the reviews that default to marked). The
 * mark is set with the review, so its review time is when it was marked. "Marked", not "added":
 * the app can't see whether `npm run eval:pull` exported it or anyone committed it.
 */
export function regressionCasesMarked(db: Db, now: Date): RegressionCases {
  const row = db
    .select({
      marked: sql<number>`coalesce(sum(${matchingDecisions.regressionCase}), 0)`,
      corrections: sql<number>`coalesce(sum(${matchingDecisions.verdict} in ('move', 'split')), 0)`,
    })
    .from(matchingDecisions)
    .where(
      and(
        isNotNull(matchingDecisions.verdict),
        gte(matchingDecisions.reviewedAt, windowStart(now, REVIEW_METRICS.regressionDays)),
        lte(matchingDecisions.reviewedAt, now),
      ),
    )
    .get();
  return { marked: Number(row?.marked ?? 0), corrections: Number(row?.corrections ?? 0) };
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
  const rows = db
    .select({ outcome: aiCalls.outcome, n: count() })
    .from(aiCalls)
    .where(
      and(
        eq(aiCalls.source, "app"),
        inArray(aiCalls.outcome, ["refused_budget", "refused_off"] satisfies AiCallOutcome[]),
        onUtcDayOf(now),
      ),
    )
    .groupBy(aiCalls.outcome)
    .all();
  const of = (outcome: AiCallOutcome) => rows.find((r) => r.outcome === outcome)?.n ?? 0;
  return { budget: of("refused_budget"), off: of("refused_off") };
}

/** Cost per Request: `totalUsd` over `n` Requests; `value` null when n is below `minN`. */
export type CostPerRequest = { n: number; totalUsd: number; value: number | null };

/**
 * Cost per Request: the Matcher and Evaluator AI calls for Requests submitted in the last 7 days,
 * ÷ those Requests. Calls from eval runs are left out; app and seed calls both count (unlike
 * today's spend, which is app calls only), so seeded Requests aren't priced at $0.
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
  const inWindow = and(gte(requests.createdAt, start), lte(requests.createdAt, now));
  const n = db.select({ n: count() }).from(requests).where(inWindow).get()?.n ?? 0;
  if (n === 0) return { n: 0, totalUsd: 0, value: null };
  const total = (where: SQL | undefined) =>
    Number(db.select({ total: sum(aiCalls.costUsd) }).from(aiCalls).where(where).get()?.total ?? 0);
  const matcherUsd = total(
    and(
      eq(aiCalls.module, "matcher"),
      ne(aiCalls.source, "eval"),
      eq(aiCalls.relatedType, "request"),
      inArray(aiCalls.relatedId, db.select({ id: requests.id }).from(requests).where(inWindow)),
    ),
  );
  const evaluatorUsd = total(
    and(
      eq(aiCalls.module, "evaluator"),
      ne(aiCalls.source, "eval"),
      eq(aiCalls.relatedType, "problem"),
      inArray(aiCalls.relatedId, db.selectDistinct({ id: requests.problemId }).from(requests).where(inWindow)),
      gte(aiCalls.time, start),
      lte(aiCalls.time, now),
    ),
  );
  const totalUsd = matcherUsd + evaluatorUsd;
  return { n, totalUsd, value: ifEnough(n, () => totalUsd / n) };
}

/** The last committed eval run's headline numbers. Eval, not production. */
export type EvalBaseline = { commit: string; date: Date; f1: number; caseAccuracy: number };

/**
 * Read relative to the working directory, so `next start` must run from the project root (as
 * `src/db` assumes for `drizzle/`). Not traced into the build output: a standalone deployment
 * would need `evals/baseline.json` copied beside it, or shows "No baseline".
 */
export const EVAL_BASELINE_PATH = path.join(/* turbopackIgnore: true */ process.cwd(), "evals", "baseline.json");

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
 * Time to decision: over `n` Problems with a recorded first decision, the median days from the
 * first Request to it; null when n is below `minN`. `untimed` counts the non-Open Problems with no
 * recorded time (decided before it was recorded).
 */
export type TimeToDecision = { n: number; medianDays: number | null; untimed: number };

/**
 * Time to decision: the median days from a Problem's first Request to its first non-Open Status
 * (`first_decided_at`, set once by `changeStatus`). Problems decided before that field existed
 * have no recorded time and aren't counted; a Problem reopened since still counts its first
 * decision.
 */
export function timeToDecision(db: Db): TimeToDecision {
  const timed = db
    .select({ decidedAt: problems.firstDecidedAt, firstRequestAt: sql<number>`min(${requests.createdAt})` })
    .from(problems)
    .innerJoin(requests, eq(requests.problemId, problems.id))
    .where(isNotNull(problems.firstDecidedAt))
    .groupBy(problems.id)
    .all();
  const days = timed.map(({ decidedAt, firstRequestAt }) =>
    Math.max(0, ((decidedAt?.getTime() ?? 0) - Number(firstRequestAt)) / DAY_MS),
  );
  const untimed =
    db
      .select({ n: count() })
      .from(problems)
      .where(and(ne(problems.status, "open"), isNull(problems.firstDecidedAt)))
      .get()?.n ?? 0;
  return { n: days.length, medianDays: ifEnough(days.length, () => median(days)), untimed };
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

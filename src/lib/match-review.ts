import { and, asc, count, desc, eq, isNotNull, isNull, ne, not, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Db } from "@/db";
import {
  aiCalls,
  ESCALATION_REASONS,
  matchingDecisions,
  people,
  problems,
  requests,
  supports,
  type EscalationReason,
  type MatcherOutcome,
  type Role,
  type SubmitterChoice,
  type Verdict,
} from "@/db/schema";
import { summaryColumns, type AiCallLine } from "@/lib/ai-calls";
import { AMBIGUITY_REASONS } from "@/lib/escalation";
import { DIFFERENT_NEEDS_QUESTION } from "@/lib/escalation-labels";

export const SUBMITTER_CHOICE_LABELS: Record<SubmitterChoice, string> = {
  accepted: "Accepted the match",
  rejected: "Rejected the match (\"mine is different\")",
  no_match: "No match proposed; created a new Problem",
};

export const VERDICT_LABELS: Record<Verdict, string> = {
  confirm: "Confirmed",
  move: "Moved",
  split: "Split",
};

/** A Matching decision with everything a PM needs to judge it. */
export type MatchingDecisionItem = {
  id: number;
  createdAt: Date;
  request: { id: number; title: string; description: string };
  submitter: { id: number; name: string; role: Role };
  proposal: {
    /** Null when the Matcher proposed a new Problem. `problemId`/`problemTitle` are null if that Problem was deleted. */
    match: {
      problemId: number | null;
      problemTitle: string | null;
      confidence: number;
      reason: string;
    } | null;
    newProblem: { title: string; need: string };
    /** With no match: the closest existing Problem the Matcher named (`problemId`/`problemTitle` null once deleted). */
    closestProblem: { problemId: number | null; problemTitle: string | null; confidence: number } | null;
  };
  submitterChoice: SubmitterChoice;
  /** "ok" unless the Matcher was bypassed (failed, off, or out of budget). */
  matcherOutcome: MatcherOutcome;
  /** Why it was escalated, strongest first. Empty: Auto-accepted. */
  escalationReasons: EscalationReason[];
  /** Marked by the PM as a Regression case. */
  regressionCase: boolean;
  /** The Problem the Request belongs to now. */
  currentProblem: { id: number; title: string };
  /** The Matcher's AI call behind the proposal (null for decisions made without one). */
  aiCall: AiCallLine | null;
  /** Null until a PM gives a Match review. */
  review: {
    verdict: Verdict;
    note: string | null;
    reviewer: { id: number; name: string } | null;
    reviewedAt: Date | null;
    fromProblem: { id: number; title: string } | null;
    toProblem: { id: number; title: string } | null;
  } | null;
};

export type MatchReviewDeps = { db: Db };

/**
 * What a PM gives with a verdict. Move needs `targetProblemId`; Split needs `newProblem`; both
 * need a note. `regressionCase` defaults to true for Move and Split, false for Confirm.
 */
export type ReviewOptions = {
  note?: string | null;
  targetProblemId?: number;
  newProblem?: { title: string; need: string };
  regressionCase?: boolean;
};


/** Matcher prompts include at most this many Matching examples. */
export const MAX_MATCHING_EXAMPLES = 20;

const submitter = alias(people, "submitter");
const reviewer = alias(people, "reviewer");
const current = alias(problems, "current_problem");
const proposed = alias(problems, "proposed_problem");
const closest = alias(problems, "closest_problem");
const fromProblem = alias(problems, "from_problem");
const toProblem = alias(problems, "to_problem");

const ref = (id: number | null, title: string | null) =>
  id !== null && title !== null ? { id, title } : null;

function list(db: Db, where: SQL, orderBy: SQL[], limit?: number): MatchingDecisionItem[] {
  const rows = db
    .select({
      d: matchingDecisions,
      request: { id: requests.id, title: requests.title, description: requests.description },
      submitter: { id: submitter.id, name: submitter.name, role: submitter.role },
      currentProblem: { id: current.id, title: current.title },
      proposedTitle: proposed.title,
      closestTitle: closest.title,
      reviewerName: reviewer.name,
      fromTitle: fromProblem.title,
      toTitle: toProblem.title,
      aiCall: summaryColumns,
    })
    .from(matchingDecisions)
    .innerJoin(requests, eq(requests.id, matchingDecisions.requestId))
    .innerJoin(submitter, eq(submitter.id, requests.authorId))
    .innerJoin(current, eq(current.id, requests.problemId))
    .leftJoin(proposed, eq(proposed.id, matchingDecisions.proposedProblemId))
    .leftJoin(closest, eq(closest.id, matchingDecisions.closestProblemId))
    .leftJoin(reviewer, eq(reviewer.id, matchingDecisions.reviewerId))
    .leftJoin(fromProblem, eq(fromProblem.id, matchingDecisions.fromProblemId))
    .leftJoin(toProblem, eq(toProblem.id, matchingDecisions.toProblemId))
    .leftJoin(aiCalls, eq(aiCalls.id, matchingDecisions.aiCallId))
    .where(where)
    .orderBy(...orderBy)
    .limit(limit ?? -1)
    .all();

  return rows.map(({ d, ...row }) => ({
    id: d.id,
    createdAt: d.createdAt,
    request: row.request,
    submitter: row.submitter,
    proposal: {
      match:
        d.confidence !== null && d.reason !== null
          ? {
              problemId: d.proposedProblemId,
              problemTitle: row.proposedTitle,
              confidence: d.confidence,
              reason: d.reason,
            }
          : null,
      newProblem: { title: d.proposedTitle, need: d.proposedNeed },
      closestProblem:
        d.closestConfidence !== null
          ? { problemId: d.closestProblemId, problemTitle: row.closestTitle, confidence: d.closestConfidence }
          : null,
    },
    submitterChoice: d.submitterChoice,
    matcherOutcome: d.matcherOutcome,
    escalationReasons: d.escalationReasons ?? [],
    regressionCase: d.regressionCase,
    currentProblem: row.currentProblem,
    aiCall: row.aiCall,
    review: d.verdict
      ? {
          verdict: d.verdict,
          note: d.note,
          reviewer:
            d.reviewerId !== null && row.reviewerName !== null
              ? { id: d.reviewerId, name: row.reviewerName }
              : null,
          reviewedAt: d.reviewedAt,
          fromProblem: ref(d.fromProblemId, row.fromTitle),
          toProblem: ref(d.toProblemId, row.toTitle),
        }
      : null,
  }));
}

/** Whether the decision's Escalation reasons include any of `reasons`. */
const hasReason = (reasons: readonly EscalationReason[]) =>
  sql`exists (select 1 from json_each(${matchingDecisions.escalationReasons}) where value in (${sql.join(
    reasons.map((r) => sql`${r}`),
    sql`, `,
  )}))`;

/** Escalated: at least one Escalation reason. */
const escalated = sql`json_array_length(coalesce(${matchingDecisions.escalationReasons}, '[]')) > 0`;

/** Rank of the decision's strongest Escalation reason (0 = bypassed, the strongest). */
const strongestReasonRank = sql`(select min(case value ${sql.join(
  ESCALATION_REASONS.map((r, i) => sql`when ${r} then ${i}`),
  sql` `,
)} end) from json_each(${matchingDecisions.escalationReasons}))`;

/**
 * Matching examples for the Matcher: reviewed decisions, corrections (Move, Split) first,
 * then most recently reviewed, capped at `limit`. Every correction counts; a Confirm only when the
 * decision was escalated for an ambiguity reason (mine is different, low confidence, near miss).
 */
export function listMatchingExamples(db: Db, limit = MAX_MATCHING_EXAMPLES): MatchingDecisionItem[] {
  const informative = and(
    isNotNull(matchingDecisions.verdict),
    or(ne(matchingDecisions.verdict, "confirm"), hasReason(AMBIGUITY_REASONS)),
  )!;
  return list(db, informative, [
    asc(sql`case when ${matchingDecisions.verdict} = 'confirm' then 1 else 0 end`),
    desc(matchingDecisions.reviewedAt),
    desc(matchingDecisions.id),
  ], limit);
}

/**
 * Match review: the PM's Escalation queue, the Not escalated list, and the Confirm, Move, and Split
 * actions.
 */
export function createMatchReview({ db }: MatchReviewDeps) {
  /**
   * Give a Match review, in one transaction. Confirm records the verdict only. Move (to
   * `targetProblemId`) and Split (into a new Problem from `newProblem`) relocate the Request and
   * its submitter's Support, delete the source Problem if it has no Evidence left, and record
   * both Problems on the decision. Returns the affected Problem ids that still exist (for
   * Confirm, the Request's Problem), so the caller can re-evaluate them after the response.
   */
  function review(
    decisionId: number,
    verdict: Verdict,
    opts: ReviewOptions,
    reviewerId: number,
  ): number[] {
    return db.transaction((tx) => {
      const found = tx
        .select({ verdict: matchingDecisions.verdict, request: requests })
        .from(matchingDecisions)
        .innerJoin(requests, eq(requests.id, matchingDecisions.requestId))
        .where(eq(matchingDecisions.id, decisionId))
        .get();
      if (!found) throw new Error("Matching decision not found");
      if (found.verdict) throw new Error("This Matching decision has already been reviewed");
      const { request } = found;
      const source = request.problemId;
      const note = opts.note?.trim() || null;
      if (verdict !== "confirm" && !note) throw new Error(`${DIFFERENT_NEEDS_QUESTION} A note is required.`);
      const recorded = {
        verdict,
        reviewerId,
        reviewedAt: new Date(),
        note,
        regressionCase: opts.regressionCase ?? verdict !== "confirm",
      };

      if (verdict === "confirm") {
        tx.update(matchingDecisions).set(recorded).where(eq(matchingDecisions.id, decisionId)).run();
        return [source];
      }

      let destination: number;
      if (verdict === "move") {
        if (opts.targetProblemId === undefined) throw new Error("Choose a Problem to move to");
        if (opts.targetProblemId === source) {
          throw new Error("The Request is already on that Problem");
        }
        const target = tx
          .select({ id: problems.id })
          .from(problems)
          .where(eq(problems.id, opts.targetProblemId))
          .get();
        if (!target) throw new Error("That Problem no longer exists");
        destination = target.id;
      } else {
        const title = opts.newProblem?.title.trim();
        const need = opts.newProblem?.need.trim();
        if (!title || !need) throw new Error("A Split needs a title and need for the new Problem");
        destination = tx
          .insert(problems)
          .values({ title, need })
          .returning({ id: problems.id })
          .get().id;
      }

      tx.update(requests).set({ problemId: destination }).where(eq(requests.id, request.id)).run();
      tx.insert(supports)
        .values({ personId: request.authorId, problemId: destination })
        .onConflictDoNothing()
        .run();
      tx.update(matchingDecisions)
        .set({ ...recorded, fromProblemId: source, toProblemId: destination })
        .where(eq(matchingDecisions.id, decisionId))
        .run();

      const authorStillThere = tx
        .select({ id: requests.id })
        .from(requests)
        .where(
          and(
            eq(requests.problemId, source),
            eq(requests.authorId, request.authorId),
            ne(requests.id, request.id),
          ),
        )
        .get();
      if (!authorStillThere) {
        tx.delete(supports)
          .where(and(eq(supports.problemId, source), eq(supports.personId, request.authorId)))
          .run();
      }

      const evidenceLeft = tx
        .select({ n: count() })
        .from(requests)
        .where(eq(requests.problemId, source))
        .get()!.n;
      if (evidenceLeft > 0) return [source, destination];
      // Cascades to its Supports; Matching decisions pointing at it get null ids.
      tx.delete(problems).where(eq(problems.id, source)).run();
      return [destination];
    });
  }

  return {
    review,

    /** The Escalation queue: escalated, unreviewed decisions by strongest reason, then oldest first. */
    listQueue: () =>
      list(db, and(isNull(matchingDecisions.verdict), escalated)!, [
        asc(strongestReasonRank),
        asc(matchingDecisions.createdAt),
        asc(matchingDecisions.id),
      ]),

    /** Not escalated: Auto-accepted decisions no PM has reviewed (still reviewable), newest first. */
    listNotEscalated: () =>
      list(db, and(isNull(matchingDecisions.verdict), not(escalated))!, [
        desc(matchingDecisions.createdAt),
        desc(matchingDecisions.id),
      ]),

    /** Reviewed Matching decisions, most recently reviewed first. */
    listReviewed: () =>
      list(db, isNotNull(matchingDecisions.verdict), [
        desc(matchingDecisions.reviewedAt),
        desc(matchingDecisions.id),
      ]),

    /** How many Escalations wait for review. */
    countQueue: () =>
      db
        .select({ n: count() })
        .from(matchingDecisions)
        .where(and(isNull(matchingDecisions.verdict), escalated))
        .get()?.n ?? 0,
  };
}

export type MatchReview = ReturnType<typeof createMatchReview>;

import { and, asc, count, desc, eq, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Db } from "@/db";
import {
  matchingDecisions,
  people,
  problems,
  requests,
  supports,
  type Role,
  type SubmitterChoice,
  type Verdict,
} from "@/db/schema";

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
  };
  submitterChoice: SubmitterChoice;
  /** The Problem the Request belongs to now. */
  currentProblem: { id: number; title: string };
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

/** One Match review, as the BoundaryNoteWriter sees it. */
export type BoundaryNoteInput = {
  /** The Problem whose Boundary note is being revised, with its current note (null if none). */
  problem: { id: number; title: string; need: string };
  currentNote: string | null;
  review: {
    request: { title: string; description: string };
    verdict: Verdict;
    fromProblem: { title: string } | null;
    toProblem: { title: string } | null;
    note: string | null;
  };
};

/**
 * AI dependency: revises a Problem's Boundary note from one Match review
 * ("Includes … Does not include …", at most 3 sentences). Wired up in a later ticket.
 */
export type BoundaryNoteWriter = (input: BoundaryNoteInput) => Promise<string>;

/** Placeholder until the production BoundaryNoteWriter exists: keeps the current note. */
export const keepBoundaryNote: BoundaryNoteWriter = async ({ currentNote }) => currentNote ?? "";

export type MatchReviewDeps = { db: Db; boundaryNoteWriter: BoundaryNoteWriter };

/** What a PM gives with a verdict. Move needs `targetProblemId`; Split needs `newProblem`. */
export type ReviewOptions = {
  note?: string | null;
  targetProblemId?: number;
  newProblem?: { title: string; need: string };
};

/** Matcher prompts include at most this many Matching examples. */
export const MAX_MATCHING_EXAMPLES = 20;

const submitter = alias(people, "submitter");
const reviewer = alias(people, "reviewer");
const current = alias(problems, "current_problem");
const proposed = alias(problems, "proposed_problem");
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
      reviewerName: reviewer.name,
      fromTitle: fromProblem.title,
      toTitle: toProblem.title,
    })
    .from(matchingDecisions)
    .innerJoin(requests, eq(requests.id, matchingDecisions.requestId))
    .innerJoin(submitter, eq(submitter.id, requests.authorId))
    .innerJoin(current, eq(current.id, requests.problemId))
    .leftJoin(proposed, eq(proposed.id, matchingDecisions.proposedProblemId))
    .leftJoin(reviewer, eq(reviewer.id, matchingDecisions.reviewerId))
    .leftJoin(fromProblem, eq(fromProblem.id, matchingDecisions.fromProblemId))
    .leftJoin(toProblem, eq(toProblem.id, matchingDecisions.toProblemId))
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
    },
    submitterChoice: d.submitterChoice,
    currentProblem: row.currentProblem,
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

/**
 * Matching examples for the Matcher: reviewed decisions, corrections (Move, Split) first,
 * then most recently reviewed, capped at `limit`.
 */
export function listMatchingExamples(db: Db, limit = MAX_MATCHING_EXAMPLES): MatchingDecisionItem[] {
  return list(db, isNotNull(matchingDecisions.verdict), [
    asc(sql`case when ${matchingDecisions.verdict} = 'confirm' then 1 else 0 end`),
    desc(matchingDecisions.reviewedAt),
    desc(matchingDecisions.id),
  ], limit);
}

/** Match review: the PM's queue of Matching decisions and the Confirm, Move, and Split actions. */
// The BoundaryNoteWriter is injected now; distillation after a review arrives in a later ticket.
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
      const recorded = {
        verdict,
        reviewerId,
        reviewedAt: new Date(),
        note: opts.note?.trim() || null,
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

    /** Unreviewed Matching decisions, newest first. */
    listQueue: () =>
      list(db, isNull(matchingDecisions.verdict), [
        desc(matchingDecisions.createdAt),
        desc(matchingDecisions.id),
      ]),

    /** Reviewed Matching decisions (Matching examples), most recently reviewed first. */
    listReviewed: () =>
      list(db, isNotNull(matchingDecisions.verdict), [
        desc(matchingDecisions.reviewedAt),
        desc(matchingDecisions.id),
      ]),

    /** How many Matching decisions wait for review. */
    countQueue: () =>
      db
        .select({ n: count() })
        .from(matchingDecisions)
        .where(isNull(matchingDecisions.verdict))
        .get()?.n ?? 0,
  };
}

export type MatchReview = ReturnType<typeof createMatchReview>;

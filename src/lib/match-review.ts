import { count, desc, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Db } from "@/db";
import {
  matchingDecisions,
  people,
  problems,
  requests,
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

export type MatchReviewDeps = { db: Db };

const submitter = alias(people, "submitter");
const reviewer = alias(people, "reviewer");
const current = alias(problems, "current_problem");
const proposed = alias(problems, "proposed_problem");
const fromProblem = alias(problems, "from_problem");
const toProblem = alias(problems, "to_problem");

const ref = (id: number | null, title: string | null) =>
  id !== null && title !== null ? { id, title } : null;

/** Match review: the PM's queue of Matching decisions (review actions come later). */
export function createMatchReview({ db }: MatchReviewDeps) {
  function list(where: SQL, orderBy: SQL[]): MatchingDecisionItem[] {
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

  return {
    /** Unreviewed Matching decisions, newest first. */
    listQueue: () =>
      list(isNull(matchingDecisions.verdict), [
        desc(matchingDecisions.createdAt),
        desc(matchingDecisions.id),
      ]),

    /** Reviewed Matching decisions (Matching examples), most recently reviewed first. */
    listReviewed: () =>
      list(isNotNull(matchingDecisions.verdict), [
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

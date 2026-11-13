import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import {
  matchingDecisions,
  problems,
  requests,
  supports,
  type SubmitterChoice,
} from "@/db/schema";
import { listMatchingExamples, type MatchingDecisionItem } from "@/lib/match-review";

/** A Request as typed by the submitter, before it is saved. */
export type RequestDraft = { title: string; description: string };

/** What the Matcher sees of each existing Problem. */
export type ProblemSummary = { id: number; title: string; need: string };

/** A new Problem statement: the underlying need, not a proposed solution. */
export type NewProblemStatement = { title: string; need: string };

/**
 * The Matcher's answer. `newProblem` is always present so that rejecting a
 * match ("mine is different") can create a Problem without a second AI call.
 */
export type MatcherResult = {
  match: { problemId: number; confidence: number; reason: string } | null;
  newProblem: NewProblemStatement;
};

/** A reviewed Matching decision (with its Match review) that the Matcher learns from. */
export type MatchingExample = MatchingDecisionItem & {
  review: NonNullable<MatchingDecisionItem["review"]>;
};

/**
 * Given a Request, summaries of every Problem, and Matching examples (corrections first, then
 * most recently reviewed, at most 20), propose a match or a new Problem.
 */
export type Matcher = (
  request: RequestDraft,
  problems: ProblemSummary[],
  examples: MatchingExample[],
) => Promise<MatcherResult>;

export type Proposal = {
  /** Null when no existing Problem has the same underlying need. */
  match: {
    problemId: number;
    problemTitle: string;
    /** 0–1. */
    confidence: number;
    reason: string;
  } | null;
  newProblem: NewProblemStatement;
};

/** The submitter's choice: attach to an existing Problem, or create a new one. */
export type Decision = { attachTo: number } | { createProblem: NewProblemStatement };

/** Derive what the submitter did with the proposal from what they chose. */
export function submitterChoiceOf(proposal: Proposal, decision: Decision): SubmitterChoice {
  if (!proposal.match) return "no_match";
  return "attachTo" in decision && decision.attachTo === proposal.match.problemId
    ? "accepted"
    : "rejected";
}

export type Confirmation = {
  problemId: number;
  requestId: number;
  createdProblem: boolean;
};

export type IntakeDeps = {
  db: Db;
  matcher: Matcher;
  /**
   * Hook called after a confirmed Request is saved, i.e. a Problem was created
   * or got new Evidence. The app uses it to schedule evaluation.
   */
  onEvidenceAdded?: (confirmation: Confirmation) => void;
};

export function createIntake({ db, matcher, onEvidenceAdded }: IntakeDeps) {
  /** Ask the Matcher what to do with a Request. Writes nothing. */
  async function propose(request: RequestDraft): Promise<Proposal> {
    const list = db
      .select({ id: problems.id, title: problems.title, need: problems.need })
      .from(problems)
      .orderBy(asc(problems.id))
      .all();
    const examples = listMatchingExamples(db) as MatchingExample[];
    const result = await matcher(request, list, examples);
    const matched = result.match && list.find((p) => p.id === result.match!.problemId);
    return {
      match:
        result.match && matched
          ? {
              problemId: matched.id,
              problemTitle: matched.title,
              confidence: Math.min(1, Math.max(0, result.match.confidence)),
              reason: result.match.reason,
            }
          : null,
      newProblem: result.newProblem,
    };
  }

  /**
   * Save the Request as Evidence on the chosen Problem (creating it if needed),
   * add the submitter's Support idempotently, and record the Matching decision:
   * `proposal` (from `propose`) plus what the submitter chose.
   */
  function confirm(
    request: RequestDraft,
    proposal: Proposal,
    decision: Decision,
    personId: number,
  ): Confirmation {
    const confirmation = db.transaction((tx) => {
      let problemId: number;
      if ("attachTo" in decision) {
        const existing = tx
          .select({ id: problems.id })
          .from(problems)
          .where(eq(problems.id, decision.attachTo))
          .get();
        if (!existing) throw new Error("That Problem no longer exists");
        problemId = existing.id;
      } else {
        problemId = tx
          .insert(problems)
          .values({ title: decision.createProblem.title, need: decision.createProblem.need })
          .returning({ id: problems.id })
          .get().id;
      }
      const requestId = tx
        .insert(requests)
        .values({ problemId, authorId: personId, title: request.title, description: request.description })
        .returning({ id: requests.id })
        .get().id;
      tx.insert(supports).values({ personId, problemId }).onConflictDoNothing().run();
      const { match } = proposal;
      // The proposed Problem may have been deleted since `propose`; keep the rest of the proposal.
      const proposedProblemId =
        match &&
        tx.select({ id: problems.id }).from(problems).where(eq(problems.id, match.problemId)).get()?.id;
      tx.insert(matchingDecisions)
        .values({
          requestId,
          proposedProblemId: proposedProblemId ?? null,
          confidence: match?.confidence ?? null,
          reason: match?.reason ?? null,
          proposedTitle: proposal.newProblem.title,
          proposedNeed: proposal.newProblem.need,
          submitterChoice: submitterChoiceOf(proposal, decision),
        })
        .run();
      return { problemId, requestId, createdProblem: !("attachTo" in decision) };
    });
    onEvidenceAdded?.(confirmation);
    return confirmation;
  }

  return { propose, confirm };
}

export type Intake = ReturnType<typeof createIntake>;

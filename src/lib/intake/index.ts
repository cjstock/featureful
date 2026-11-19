import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import {
  aiCalls,
  matchingDecisions,
  problems,
  requests,
  supports,
  type AiCallOutcome,
  type MatcherOutcome,
  type SubmitterChoice,
} from "@/db/schema";
import { failedAiCall } from "@/lib/ai";
import { storeEscalationReasons, type DbOrTx } from "@/lib/escalation";
import { listMatchingExamples, type MatchingDecisionItem } from "@/lib/match-review";
import { isMatcherPromptFor, matcherResultFromOutput } from "./llm-matcher";

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
  /**
   * When proposing a new Problem: the closest existing Problem and the Matcher's confidence that
   * it shares the need (null if there are none). Ignored alongside a match.
   */
  closestProblem?: { problemId: number; confidence: number } | null;
  /** The Matcher's one-line reason, including why nothing matches. Read by the eval report; intake ignores it. */
  reason?: string;
  /** The AI call that produced this answer (absent for fakes). */
  aiCallId?: number;
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
  /** With no match: the closest existing Problem, if the Matcher named one it was shown. */
  closestProblem?: { problemId: number; confidence: number } | null;
  /** The Matcher's AI call, recorded on the Matching decision at confirm. */
  aiCallId?: number | null;
  /** "ok" unless the Matcher was bypassed (then the proposal is a new Problem from the Request itself). */
  matcherOutcome?: MatcherOutcome;
};

/** Longest need a fallback new-Problem statement takes from the Request's description. */
const MAX_FALLBACK_NEED = 2000;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** How a Matcher AI call that didn't return ok bypassed the Matcher. */
export function matcherOutcomeOf(outcome: AiCallOutcome): MatcherOutcome {
  if (outcome === "ok") return "ok";
  if (outcome === "refused_budget") return "budget";
  if (outcome === "refused_off") return "off";
  return "failed";
}

/**
 * The Matcher's answer as a proposal, keeping only what holds against the Problems it was shown:
 * a match to one of them (with its title), and, with no match, a closest Problem among them.
 */
function toProposal(result: MatcherResult, shown: ProblemSummary[], aiCallId: number | null): Proposal {
  const matched = result.match && shown.find((p) => p.id === result.match!.problemId);
  const closest =
    !matched && result.closestProblem && shown.some((p) => p.id === result.closestProblem!.problemId)
      ? { problemId: result.closestProblem.problemId, confidence: clamp01(result.closestProblem.confidence) }
      : null;
  return {
    match:
      result.match && matched
        ? {
            problemId: matched.id,
            problemTitle: matched.title,
            confidence: clamp01(result.match.confidence),
            reason: result.match.reason,
          }
        : null,
    newProblem: result.newProblem,
    closestProblem: closest,
    aiCallId,
    matcherOutcome: "ok",
  };
}

/** A bypassed proposal: no match, and a new Problem stated from the Request itself. */
function bypassedProposal(request: RequestDraft, outcome: MatcherOutcome, aiCallId: number | null): Proposal {
  return {
    match: null,
    newProblem: { title: request.title, need: request.description.slice(0, MAX_FALLBACK_NEED) },
    closestProblem: null,
    aiCallId,
    matcherOutcome: outcome,
  };
}

const shownProblemsSchema = z.array(z.object({ id: z.number().int(), title: z.string(), need: z.string() }));

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
  /**
   * What `propose` does when the Matcher throws. "throw" (the default, for the eval and the seed,
   * which must stop on a failed AI call) rethrows. "bypass" (the app) lets the submitter go on:
   * the proposal is a new Problem stated from the Request itself, with `matcherOutcome: "failed"`.
   */
  onMatcherFailure?: "throw" | "bypass";
};

export function createIntake({ db, matcher, onEvidenceAdded, onMatcherFailure = "throw" }: IntakeDeps) {
  /**
   * Ask the Matcher what to do with a Request. Writes nothing but the AI call record of an AI
   * Matcher. If the Matcher fails and `onMatcherFailure` is "bypass", the submitter can still save
   * the Request: the proposal is a new Problem stated from the Request itself, with
   * `matcherOutcome: "failed"` (escalated as Bypassed).
   */
  async function propose(request: RequestDraft): Promise<Proposal> {
    const list = db
      .select({
        id: problems.id,
        title: problems.title,
        need: problems.need,
      })
      .from(problems)
      .orderBy(asc(problems.id))
      .all();
    const examples = listMatchingExamples(db) as MatchingExample[];
    let result: MatcherResult;
    try {
      result = await matcher(request, list, examples);
    } catch (error) {
      if (onMatcherFailure === "throw") throw error;
      // The AI call record `aiGenerate` wrote says how it was bypassed (refused for budget, switched
      // off, or failed); a Matcher that left no record (a fake) counts as failed.
      const recorded = failedAiCall(error);
      const outcome = recorded ? matcherOutcomeOf(recorded.outcome) : "failed";
      console.error(`The Matcher was bypassed (${outcome}); proposing a new Problem from the Request itself`, error);
      return bypassedProposal(request, outcome, recorded?.id ?? null);
    }
    return toProposal(result, list, result.aiCallId ?? null);
  }

  /**
   * This person's own app Matcher AI call about this same Request, not yet linked to a Request
   * (any outcome). Undefined for anything else, e.g. an id the client made up or reused.
   */
  function ownUnusedMatcherCall(tx: DbOrTx, aiCallId: number | null | undefined, personId: number, request: RequestDraft) {
    if (!aiCallId) return undefined;
    const call = tx
      .select({
        id: aiCalls.id,
        promptVersion: aiCalls.promptVersion,
        prompt: aiCalls.prompt,
        outcome: aiCalls.outcome,
        output: aiCalls.output,
        shownProblems: aiCalls.shownProblems,
      })
      .from(aiCalls)
      .where(
        and(
          eq(aiCalls.id, aiCallId),
          eq(aiCalls.source, "app"),
          eq(aiCalls.module, "matcher"),
          isNull(aiCalls.relatedId),
          eq(aiCalls.personId, personId),
        ),
      )
      .get();
    return call && isMatcherPromptFor(call.prompt, request) ? call : undefined;
  }

  /**
   * Save the Request as Evidence on the chosen Problem (creating it if needed), add the
   * submitter's Support idempotently, and record the Matching decision: the proposal `resolve`
   * returns (inside the transaction), what the submitter chose, and its Escalation reasons.
   */
  function save(
    request: RequestDraft,
    decision: Decision,
    personId: number,
    resolve: (tx: DbOrTx) => { proposal: Proposal; aiCall?: { id: number; promptVersion: string } },
  ): Confirmation {
    const confirmation = db.transaction((tx) => {
      const { proposal, aiCall } = resolve(tx);
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
      const exists = (id: number) =>
        tx.select({ id: problems.id }).from(problems).where(eq(problems.id, id)).get()?.id;
      const proposedProblemId = match && exists(match.problemId);
      const closest = !match ? proposal.closestProblem : null;
      const closestProblemId = closest && exists(closest.problemId);
      if (aiCall) {
        tx.update(aiCalls)
          .set({ relatedType: "request", relatedId: requestId })
          .where(eq(aiCalls.id, aiCall.id))
          .run();
      }
      const decisionId = tx
        .insert(matchingDecisions)
        .values({
          requestId,
          proposedProblemId: proposedProblemId ?? null,
          confidence: match?.confidence ?? null,
          reason: match?.reason ?? null,
          proposedTitle: proposal.newProblem.title,
          proposedNeed: proposal.newProblem.need,
          submitterChoice: submitterChoiceOf(proposal, decision),
          promptVersion: aiCall?.promptVersion ?? null,
          aiCallId: aiCall?.id ?? null,
          matcherOutcome: proposal.matcherOutcome ?? "ok",
          closestProblemId: closestProblemId ?? null,
          closestConfidence: closest?.confidence ?? null,
        })
        .returning({ id: matchingDecisions.id })
        .get().id;
      storeEscalationReasons(tx, decisionId);
      return { problemId, requestId, createdProblem: !("attachTo" in decision) };
    });
    onEvidenceAdded?.(confirmation);
    return confirmation;
  }

  /**
   * Record a Request whose proposal the caller got from `propose` itself (the seed, the eval,
   * tests): the proposal is taken as given. Its AI call is linked only if it is this person's own
   * unused app Matcher call about this Request that returned ok.
   */
  function confirm(request: RequestDraft, proposal: Proposal, decision: Decision, personId: number): Confirmation {
    return save(request, decision, personId, (tx) => {
      const call = ownUnusedMatcherCall(tx, proposal.aiCallId, personId, request);
      return { proposal, aiCall: call?.outcome === "ok" ? call : undefined };
    });
  }

  /**
   * Record a Request for the app, where the proposal came back from the browser and can't be
   * trusted. Only its `aiCallId` is read, as a claim, and everything that drives Escalation is
   * derived on the server from that AI call record:
   * - this person's own unused app Matcher call about this Request that returned ok: the match,
   *   confidence, new Problem and closest Problem from its stored output, checked against the
   *   Problems it was shown;
   * - such a call that didn't return ok: Bypassed, with its outcome (budget, off, failed);
   * - no such call: Bypassed (failed). Never Auto-accepted on the client's word.
   * The AI call, when there is one, is linked to the Request.
   */
  function confirmFromClient(
    request: RequestDraft,
    /** Whatever the client echoed back; only `aiCallId` is read. */
    claimed: Partial<Proposal>,
    decision: Decision,
    personId: number,
  ): Confirmation {
    return save(request, decision, personId, (tx) => {
      const call = ownUnusedMatcherCall(tx, claimed.aiCallId, personId, request);
      if (!call) return { proposal: bypassedProposal(request, "failed", null) };
      if (call.outcome !== "ok") {
        return { proposal: bypassedProposal(request, matcherOutcomeOf(call.outcome), call.id), aiCall: call };
      }
      const result = call.output === null ? null : matcherResultFromOutput(call.output);
      const shown = shownProblemsSchema.safeParse(call.shownProblems);
      if (!result || !shown.success) return { proposal: bypassedProposal(request, "failed", call.id), aiCall: call };
      return { proposal: toProposal(result, shown.data, call.id), aiCall: call };
    });
  }

  return { propose, confirm, confirmFromClient };
}

export type Intake = ReturnType<typeof createIntake>;

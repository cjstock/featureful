"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { idSchema, message, type Result } from "@/lib/action-result";
import { appCaller } from "@/lib/ai";
import { getCurrentPerson } from "@/lib/identity";
import { createIntake, type Proposal } from "@/lib/intake";
import { createLlmMatcher } from "@/lib/intake/llm-matcher";
import { tryEvaluateProblem } from "@/lib/evaluator";
import { checkSubmitRateLimit, rateLimitMessage } from "@/lib/rate-limit";

const draftSchema = z.object({
  title: z.string().trim().min(1, "Give your Request a title").max(200),
  description: z.string().trim().min(1, "Describe your Request").max(5000),
});

const decisionSchema = z.union([
  z.object({ attachTo: idSchema }),
  z.object({
    createProblem: z.object({
      title: z.string().trim().min(1).max(200),
      need: z.string().trim().min(1).max(2000),
    }),
  }),
]);

/**
 * The proposal from step 1, echoed back by the client. Only its AI call id is read, as a claim:
 * the match, confidence, closest Problem and Matcher outcome are derived on the server from that
 * AI call record (`Intake.confirmFromClient`), so a tampered proposal can't dodge Escalation.
 */
const proposalClaimSchema = z.object({ aiCallId: idSchema.nullable().optional() });

export type RequestDraftInput = z.input<typeof draftSchema>;
export type DecisionInput = z.input<typeof decisionSchema>;

/** Intake for the current person, whose AI calls (Matcher, then Evaluator) are recorded as theirs. */
function intake(personId: number) {
  const db = getDb();
  const caller = appCaller(personId);
  return createIntake({
    db,
    matcher: createLlmMatcher(db, caller),
    // A failed Matcher never blocks a submitter: they save a new Problem, escalated as Bypassed.
    onMatcherFailure: "bypass",
    // Re-evaluate a Problem once it is created or gets new Evidence, after the response is sent.
    // Pages are dynamic and read the db per request, so the next visit shows the new scores.
    onEvidenceAdded: ({ problemId }) => after(() => tryEvaluateProblem(db, problemId, caller)),
  });
}

/** Step 1: ask the AI to match the Request. Saves nothing. */
export async function proposeRequest(
  input: RequestDraftInput,
): Promise<Result<{ proposal: Proposal }>> {
  try {
    // Every role (Customer, Support agent, PM) may submit Requests.
    const person = await getCurrentPerson();
    const draft = draftSchema.parse(input);
    // Checked here too, so a submitter over the limit spends no Matcher AI call.
    const limit = checkSubmitRateLimit(getDb(), person.id, new Date());
    if (!limit.ok) return { ok: false, error: rateLimitMessage(limit.retryAt) };
    return { ok: true, proposal: await intake(person.id).propose(draft) };
  } catch (error) {
    console.error("proposeRequest failed", error);
    return { ok: false, error: message(error) };
  }
}

/** Step 2: save the Request on the chosen Problem, add the submitter's Support, and record the Matching decision. */
export async function confirmRequest(
  input: RequestDraftInput,
  proposal: Proposal,
  decision: DecisionInput,
): Promise<Result<{ problemId: number }>> {
  try {
    const person = await getCurrentPerson();
    const draft = draftSchema.parse(input);
    // The rate limit itself: this check and the save below run with no await between them.
    const limit = checkSubmitRateLimit(getDb(), person.id, new Date());
    if (!limit.ok) return { ok: false, error: rateLimitMessage(limit.retryAt) };
    const { problemId } = intake(person.id).confirmFromClient(
      draft,
      proposalClaimSchema.parse(proposal),
      decisionSchema.parse(decision),
      person.id,
    );
    revalidatePath("/", "layout");
    return { ok: true, problemId };
  } catch (error) {
    console.error("confirmRequest failed", error);
    return { ok: false, error: message(error) };
  }
}

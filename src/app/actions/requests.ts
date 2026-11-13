"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { idSchema, message, type Result } from "@/lib/action-result";
import { getCurrentPerson } from "@/lib/identity";
import { createIntake, type Confirmation, type Proposal } from "@/lib/intake";
import { llmMatcher } from "@/lib/intake/llm-matcher";
import { tryEvaluateProblem } from "@/lib/evaluator";

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

export type RequestDraftInput = z.input<typeof draftSchema>;
export type DecisionInput = z.input<typeof decisionSchema>;

/** Re-evaluate a Problem once it is created or gets new Evidence, after the response is sent. */
function onEvidenceAdded({ problemId }: Confirmation) {
  // Pages are dynamic and read the db per request, so the next visit shows the new scores.
  after(() => tryEvaluateProblem(getDb(), problemId));
}

function intake() {
  return createIntake({ db: getDb(), matcher: llmMatcher, onEvidenceAdded });
}

/** Step 1: ask the AI to match the Request. Saves nothing. */
export async function proposeRequest(
  input: RequestDraftInput,
): Promise<Result<{ proposal: Proposal }>> {
  try {
    // Every role (Customer, Support agent, PM) may submit Requests.
    await getCurrentPerson();
    const draft = draftSchema.parse(input);
    return { ok: true, proposal: await intake().propose(draft) };
  } catch (error) {
    console.error("proposeRequest failed", error);
    return { ok: false, error: message(error) };
  }
}

/** Step 2: save the Request on the chosen Problem and add the submitter's Support. */
export async function confirmRequest(
  input: RequestDraftInput,
  decision: DecisionInput,
): Promise<Result<{ problemId: number }>> {
  try {
    const person = await getCurrentPerson();
    const draft = draftSchema.parse(input);
    const { problemId } = intake().confirm(draft, decisionSchema.parse(decision), person.id);
    revalidatePath("/", "layout");
    return { ok: true, problemId };
  } catch (error) {
    console.error("confirmRequest failed", error);
    return { ok: false, error: message(error) };
  }
}

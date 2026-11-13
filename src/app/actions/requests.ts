"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requireRole } from "@/lib/identity";
import { createIntake, type Confirmation, type Proposal } from "@/lib/intake";
import { llmMatcher } from "@/lib/intake/llm-matcher";

const draftSchema = z.object({
  title: z.string().trim().min(1, "Give your Request a title").max(200),
  description: z.string().trim().min(1, "Describe your Request").max(5000),
});

const decisionSchema = z.union([
  z.object({ attachTo: z.number().int().positive() }),
  z.object({
    createProblem: z.object({
      title: z.string().trim().min(1).max(200),
      need: z.string().trim().min(1).max(2000),
    }),
  }),
]);

export type RequestDraftInput = z.input<typeof draftSchema>;
export type DecisionInput = z.input<typeof decisionSchema>;
type Result<T> = { ok: true } & T | { ok: false; error: string };

/**
 * Hook point for evaluating a Problem once it is created or gets new Evidence.
 * Ticket 05 wires the Evaluator here, e.g. `after(() => evaluate(problemId))`.
 */
function onEvidenceAdded(confirmation: Confirmation) {
  void confirmation;
}

function intake() {
  return createIntake({ db: getDb(), matcher: llmMatcher, onEvidenceAdded });
}

function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Invalid input";
  return error instanceof Error ? error.message : "Something went wrong";
}

/** Step 1: ask the AI to match the Request. Saves nothing. */
export async function proposeRequest(
  input: RequestDraftInput,
): Promise<Result<{ proposal: Proposal }>> {
  try {
    await requireRole("customer", "support_agent");
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
    const person = await requireRole("customer", "support_agent");
    const draft = draftSchema.parse(input);
    const { problemId } = intake().confirm(draft, decisionSchema.parse(decision), person.id);
    revalidatePath("/", "layout");
    return { ok: true, problemId };
  } catch (error) {
    console.error("confirmRequest failed", error);
    return { ok: false, error: message(error) };
  }
}

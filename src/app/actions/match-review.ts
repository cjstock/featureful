"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { idSchema, message, type Result } from "@/lib/action-result";
import { tryEvaluateProblem } from "@/lib/evaluator";
import { requireRole } from "@/lib/identity";
import { getMatchReview } from "@/lib/match-review-app";

const note = z.string().trim().max(2000).optional();

const reviewSchema = z.discriminatedUnion("verdict", [
  z.object({ verdict: z.literal("confirm"), note }),
  z.object({ verdict: z.literal("move"), targetProblemId: idSchema, note }),
  z.object({
    verdict: z.literal("split"),
    newProblem: z.object({
      title: z.string().trim().min(1, "Give the new Problem a title").max(200),
      need: z.string().trim().min(1, "Describe the new Problem's need").max(2000),
    }),
    note,
  }),
]);

export type MatchReviewInput = z.input<typeof reviewSchema>;

/**
 * PM only: give a Match review (Confirm, Move, or Split). After a Move or Split the affected
 * Problems are re-evaluated in the background.
 */
export async function reviewMatch(decisionId: number, input: MatchReviewInput): Promise<Result> {
  try {
    const pm = await requireRole("pm");
    const { verdict, ...opts } = reviewSchema.parse(input);
    const affected = getMatchReview().review(idSchema.parse(decisionId), verdict, opts, pm.id);
    if (verdict !== "confirm") {
      after(async () => {
        for (const problemId of affected) await tryEvaluateProblem(getDb(), problemId);
      });
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("reviewMatch failed", error);
    return { ok: false, error: message(error) };
  }
}

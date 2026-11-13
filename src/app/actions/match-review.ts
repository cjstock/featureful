"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { idSchema, message, type Result } from "@/lib/action-result";
import { tryEvaluateProblem } from "@/lib/evaluator";
import { requireRole } from "@/lib/identity";
import { setBoundaryNote } from "@/lib/match-review";
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
 * PM only: give a Match review (Confirm, Move, or Split). In the background, the review is
 * distilled into the affected Problems' Boundary notes and, after a Move or Split, the affected
 * Problems are re-evaluated.
 */
export async function reviewMatch(decisionId: number, input: MatchReviewInput): Promise<Result> {
  try {
    const pm = await requireRole("pm");
    const { verdict, ...opts } = reviewSchema.parse(input);
    const matchReview = getMatchReview();
    const id = idSchema.parse(decisionId);
    const affected = matchReview.review(id, verdict, opts, pm.id);
    after(async () => {
      // Never throws; Confirm without a note makes no AI call.
      await matchReview.distilBoundaryNotes(id);
      if (verdict !== "confirm") {
        for (const problemId of affected) await tryEvaluateProblem(getDb(), problemId);
      }
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("reviewMatch failed", error);
    return { ok: false, error: message(error) };
  }
}

const boundaryNoteSchema = z.string().trim().max(1000);

/** PM only: edit a Problem's Boundary note directly (blank clears it). */
export async function updateBoundaryNote(problemId: number, note: string): Promise<Result> {
  try {
    await requireRole("pm");
    const id = idSchema.parse(problemId);
    if (!setBoundaryNote(getDb(), id, boundaryNoteSchema.parse(note))) {
      return { ok: false, error: "That Problem no longer exists" };
    }
    revalidatePath(`/problems/${id}`);
    return { ok: true };
  } catch (error) {
    console.error("updateBoundaryNote failed", error);
    return { ok: false, error: message(error) };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { idSchema, message, type Result } from "@/lib/action-result";
import { requireRole } from "@/lib/identity";
import { clearScoreOverride, setScoreOverride, type ScoreOverride } from "@/lib/score-override";

/** PM only: override a Problem's Priority score (0–100) with a required note. */
export async function overrideScore(problemId: number, input: ScoreOverride): Promise<Result> {
  try {
    await requireRole("pm");
    if (!setScoreOverride(getDb(), idSchema.parse(problemId), input)) {
      return { ok: false, error: "Problem not found" };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("overrideScore failed", error);
    return { ok: false, error: message(error) };
  }
}

/** PM only: clear the override so the computed Priority score applies again. */
export async function clearOverride(problemId: number): Promise<Result> {
  try {
    await requireRole("pm");
    if (!clearScoreOverride(getDb(), idSchema.parse(problemId))) {
      return { ok: false, error: "Problem not found" };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("clearOverride failed", error);
    return { ok: false, error: message(error) };
  }
}

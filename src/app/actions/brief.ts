"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { idSchema, message, type Result } from "@/lib/action-result";
import { generateBrief } from "@/lib/brief-writer";
import { requireRole } from "@/lib/identity";

/** PM only: generate or regenerate a Problem's Decision brief (one AI call). */
export async function generateDecisionBrief(problemId: number): Promise<Result> {
  try {
    await requireRole("pm");
    const id = idSchema.parse(problemId);
    await generateBrief(getDb(), id);
    revalidatePath(`/problems/${id}`);
    return { ok: true };
  } catch (error) {
    console.error("generateDecisionBrief failed", error);
    return { ok: false, error: `Brief generation failed: ${message(error)}` };
  }
}

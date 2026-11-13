"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { generateBrief } from "@/lib/brief-writer";
import { requireRole } from "@/lib/identity";

type Result = { ok: true } | { ok: false; error: string };

/** PM only: generate or regenerate a Problem's Decision brief (one AI call). */
export async function generateDecisionBrief(problemId: number): Promise<Result> {
  try {
    await requireRole("pm");
    const id = z.number().int().positive().parse(problemId);
    await generateBrief(getDb(), id);
    revalidatePath(`/problems/${id}`);
    return { ok: true };
  } catch (error) {
    console.error("generateDecisionBrief failed", error);
    return {
      ok: false,
      error: `Brief generation failed: ${error instanceof Error ? error.message : "Something went wrong"}`,
    };
  }
}

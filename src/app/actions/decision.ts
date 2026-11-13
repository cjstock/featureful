"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { STATUSES } from "@/db/schema";
import { requireRole } from "@/lib/identity";
import { changeStatus, draftDecisionNote, type StatusChange } from "@/lib/decision-note";

const idSchema = z.number().int().positive();

function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Invalid input";
  return error instanceof Error ? error.message : "Something went wrong";
}

/** PM only: save a Problem's Status and Decision note together. */
export async function updateStatus(
  problemId: number,
  input: StatusChange,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireRole("pm");
    if (!changeStatus(getDb(), idSchema.parse(problemId), input)) {
      return { ok: false, error: "Problem not found" };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("updateStatus failed", error);
    return { ok: false, error: message(error) };
  }
}

/** PM only: ask the AI to draft a Customer-facing Decision note (one AI call). Saves nothing. */
export async function draftNote(
  problemId: number,
  targetStatus: string,
): Promise<{ ok: true; note: string } | { ok: false; error: string }> {
  try {
    await requireRole("pm");
    const note = await draftDecisionNote(
      getDb(),
      idSchema.parse(problemId),
      z.enum(STATUSES).parse(targetStatus),
    );
    return { ok: true, note };
  } catch (error) {
    console.error("draftNote failed", error);
    return { ok: false, error: `Drafting failed: ${message(error)}` };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { STATUSES, type Status } from "@/db/schema";
import { idSchema, message, type Result } from "@/lib/action-result";
import { requireRole } from "@/lib/identity";
import { changeStatus, draftDecisionNote, type StatusChange } from "@/lib/decision-note";

/** PM only: save a Problem's Status and Decision note together. */
export async function updateStatus(
  problemId: number,
  input: StatusChange,
): Promise<Result> {
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
  targetStatus: Status,
): Promise<Result<{ note: string }>> {
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

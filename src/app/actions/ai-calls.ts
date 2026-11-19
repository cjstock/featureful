"use server";

import { getDb } from "@/db/client";
import { idSchema, message, type Result } from "@/lib/action-result";
import { getAiCallContent, type AiCallContent } from "@/lib/ai-calls";
import { requireRole } from "@/lib/identity";

/** PM only: the stored prompt and output of one AI call ("view prompt"). */
export async function viewAiCall(aiCallId: number): Promise<Result<{ aiCall: AiCallContent }>> {
  try {
    const pm = await requireRole("pm");
    const aiCall = getAiCallContent(getDb(), pm, idSchema.parse(aiCallId));
    if (!aiCall) return { ok: false, error: "AI call not found" };
    return { ok: true, aiCall };
  } catch (error) {
    console.error("viewAiCall failed", error);
    return { ok: false, error: message(error) };
  }
}

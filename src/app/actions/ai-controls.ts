"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { CALLABLE_AI_MODULES, type CallableAiModule } from "@/db/schema";
import { message, type Result } from "@/lib/action-result";
import { setModuleOn } from "@/lib/ai-controls";
import { requireRole } from "@/lib/identity";

/** PM only: switch an AI module on or off (AI controls on `/strategy`). Every flip is recorded. */
export async function setAiModuleOn(module: CallableAiModule, on: boolean): Promise<Result> {
  try {
    const pm = await requireRole("pm");
    setModuleOn(getDb(), z.enum(CALLABLE_AI_MODULES).parse(module), z.boolean().parse(on), pm.id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("setAiModuleOn failed", error);
    return { ok: false, error: message(error) };
  }
}

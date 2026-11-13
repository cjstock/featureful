"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { idSchema, message, type Result } from "@/lib/action-result";
import { requireRole } from "@/lib/identity";
import { evaluateAllProblems, evaluateProblem } from "@/lib/evaluator";
import { saveProductStrategy } from "@/lib/product-strategy";

/** PM only: re-run the Evaluator on one Problem now. */
export async function reevaluateProblem(problemId: number): Promise<Result> {
  try {
    await requireRole("pm");
    await evaluateProblem(getDb(), idSchema.parse(problemId));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("reevaluateProblem failed", error);
    return { ok: false, error: `Evaluation failed: ${message(error)}` };
  }
}

/** PM only: re-run the Evaluator on every Problem (e.g. after editing the Product Strategy). */
export async function reevaluateAllProblems(): Promise<Result<{ total: number; failed: number }>> {
  try {
    await requireRole("pm");
    const result = await evaluateAllProblems(getDb());
    revalidatePath("/", "layout");
    return { ok: true, ...result };
  } catch (error) {
    console.error("reevaluateAllProblems failed", error);
    return { ok: false, error: message(error) };
  }
}

const strategySchema = z.string().trim().min(1, "The Product Strategy can't be empty").max(5000);

/** PM only: save the single Product Strategy text. Does not re-evaluate; the PM chooses when. */
export async function updateProductStrategy(body: string): Promise<Result> {
  try {
    await requireRole("pm");
    saveProductStrategy(getDb(), strategySchema.parse(body));
    revalidatePath("/strategy");
    return { ok: true };
  } catch (error) {
    console.error("updateProductStrategy failed", error);
    return { ok: false, error: message(error) };
  }
}

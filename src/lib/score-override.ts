import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { problems } from "@/db/schema";

/** PM score override input: a 0–100 Priority score plus a required note explaining why. */
export const scoreOverrideSchema = z.object({
  score: z
    .number({ error: "Enter a score from 0 to 100" })
    .int("The override must be a whole number")
    .min(0, "The override must be between 0 and 100")
    .max(100, "The override must be between 0 and 100"),
  note: z
    .string()
    .trim()
    .min(1, "Explain why you're overriding the score")
    .max(1000, "Keep the note under 1000 characters"),
});

export type ScoreOverride = z.infer<typeof scoreOverrideSchema>;

/** Sets the override; it replaces the Priority score for display and sorting. Returns false if no such Problem. */
export function setScoreOverride(db: Db, problemId: number, input: ScoreOverride): boolean {
  const { score, note } = scoreOverrideSchema.parse(input);
  const result = db
    .update(problems)
    .set({ overrideScore: score, overrideNote: note })
    .where(eq(problems.id, problemId))
    .run();
  return result.changes > 0;
}

/** Clears the override so the computed Priority score applies again. */
export function clearScoreOverride(db: Db, problemId: number): boolean {
  const result = db
    .update(problems)
    .set({ overrideScore: null, overrideNote: null })
    .where(eq(problems.id, problemId))
    .run();
  return result.changes > 0;
}

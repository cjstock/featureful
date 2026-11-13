import { z } from "zod";

/**
 * Shared shape for server action results. Actions return errors instead of throwing because
 * production builds mask thrown messages.
 */
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Positive integer id (Problem, Person). */
export const idSchema = z.number().int().positive();

/** A readable message for any thrown error; ZodErrors become their first issue's message. */
export function message(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Invalid input";
  return error instanceof Error ? error.message : "Something went wrong";
}

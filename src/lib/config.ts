import type { AiModule } from "@/db/schema";

/** The one Claude model every AI call uses. */
export const CLAUDE_MODEL = "claude-sonnet-5-5";

/** Anthropic list prices in USD per million tokens (see .scratch/v2/issues/01-ai-call-seam-facts.md). */
export type ModelPrices = { input: number; output: number; cacheRead: number; cacheWrite: number };

export const MODEL_PRICES: Record<string, ModelPrices> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  // Unused today. Input/output are from the research ticket; the cache prices are UNVERIFIED (not
  // from a primary source), so check them before routing any AI call to Haiku.
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/**
 * Most output tokens each AI module may return per AI call (`maxOutputTokens`), so every call has
 * a known worst-case cost before it is sent.
 */
export const AI_MAX_OUTPUT_TOKENS = {
  matcher: 1_000,
  evaluator: 1_500,
  boundary_note: 400, // retired (ADR 0003): no module calls with it
  decision_note: 800,
  brief: 2_500,
} as const satisfies Record<AiModule, number>;

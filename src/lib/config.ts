/** The one Claude model every AI call uses. */
export const CLAUDE_MODEL = "claude-sonnet-5-5";

/** Anthropic list prices in USD per million tokens (see .scratch/v2/issues/01-ai-call-seam-facts.md). */
export type ModelPrices = { input: number; output: number; cacheRead: number; cacheWrite: number };

export const MODEL_PRICES: Record<string, ModelPrices> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

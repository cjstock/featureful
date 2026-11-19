import type { CallableAiModule } from "@/db/schema";

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
  decision_note: 800,
  brief: 2_500,
} as const satisfies Record<CallableAiModule, number>;

/**
 * Escalation reason thresholds (escalation ticket). A Matching decision with any reason is an
 * Escalation; one with none is Auto-accepted.
 */
export const ESCALATION = {
  /** High-Demand merge: an accepted match into a Problem with at least this many supporters, counting the submitter. */
  highDemandSupporters: 5,
  /** Low confidence: a match below this confidence. */
  lowConfidenceBelow: 0.75,
  /** Near miss: no match, and the closest Problem's confidence is at least this. */
  nearMissAtLeast: 0.4,
  /** Spot check: this share of the decisions with no other reason. */
  spotCheckRate: 0.1,
  /** Seeds the spot-check sample, so a decision's sampling is stable. Changing it re-draws the sample. */
  spotCheckSalt: "featureful-spot-check-v1",
} as const;

/** The daily app AI budget when `AI_DAILY_BUDGET_USD` isn't set. */
export const DEFAULT_AI_DAILY_BUDGET_USD = 2;

/**
 * The daily budget for `app` AI calls, in USD, from `AI_DAILY_BUDGET_USD` (default $2). It resets
 * at 00:00 UTC; seed and eval runs keep their own per-run caps. Read on every AI call, so a change
 * applies without a restart. Throws if the variable is set to anything but a non-negative amount.
 */
export function aiDailyBudgetUsd(): number {
  const raw = process.env.AI_DAILY_BUDGET_USD?.trim();
  if (!raw) return DEFAULT_AI_DAILY_BUDGET_USD;
  const budget = Number(raw);
  if (!Number.isFinite(budget) || budget < 0) {
    throw new Error(`AI_DAILY_BUDGET_USD must be a non-negative amount in USD, not "${raw}"`);
  }
  return budget;
}

/** Request submissions: at most `max` per person in any rolling `windowMs`. */
export const REQUEST_RATE_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 } as const;

import type { ModelPrices } from "@/lib/config";

/**
 * The eval's local AI-call meter: counts calls and cost, and refuses a call that
 * would go over the per-run cap (60 calls or $1). There's no `aiGenerate` seam
 * yet; whichever of the AI-call-seam and delimiting slices lands second wires
 * the harness through it instead.
 */

/** A per-run cap on AI calls and spend. */
export type EvalCap = { maxCalls: number; maxCostUsd: number };

export const EVAL_CAP: EvalCap = { maxCalls: 60, maxCostUsd: 1 };

/**
 * The Matcher's output cap (spec: Matcher 1,000). The eval sets it on every live
 * call, so a call can never cost more than `worstCaseCallCost`.
 */
export const MATCHER_MAX_OUTPUT_TOKENS = 1_000;

export type TokenUsage = {
  input: { noCache: number; cacheRead: number; cacheWrite: number };
  output: number;
};

const PER_TOKEN = 1 / 1_000_000;

/** What a call cost, from its token usage and per-million-token prices. */
export function costOf(usage: TokenUsage, prices: ModelPrices): number {
  return (
    (usage.input.noCache * prices.input +
      usage.input.cacheRead * prices.cacheRead +
      usage.input.cacheWrite * prices.cacheWrite +
      usage.output * prices.output) *
    PER_TOKEN
  );
}

/** The most a call can cost: prompt characters ÷ 4 as input tokens, plus a full answer at the output cap. */
export function worstCaseCallCost(promptChars: number, prices: ModelPrices): number {
  return ((promptChars / 4) * prices.input + MATCHER_MAX_OUTPUT_TOKENS * prices.output) * PER_TOKEN;
}

export class CapReachedError extends Error {
  name = "CapReachedError";
}

export type Meter = ReturnType<typeof createMeter>;

export function createMeter(cap: EvalCap) {
  let calls = 0;
  let costUsd = 0;
  return {
    /** Call before each AI call with its worst-case cost; throws `CapReachedError` rather than risk the cap. */
    beforeCall(estimatedCostUsd: number) {
      if (calls >= cap.maxCalls) {
        throw new CapReachedError(`Eval cap reached: ${cap.maxCalls} AI calls already made this run.`);
      }
      if (costUsd + estimatedCostUsd > cap.maxCostUsd) {
        throw new CapReachedError(
          `Eval cap reached: $${costUsd.toFixed(4)} spent and the next call (up to $${estimatedCostUsd.toFixed(4)}) would pass $${cap.maxCostUsd}.`,
        );
      }
      calls++;
    },
    /** Record what a call actually cost. */
    afterCall(actualCostUsd: number) {
      costUsd += actualCostUsd;
    },
    totals: () => ({ calls, costUsd }),
  };
}

import type { AiMeter } from "@/lib/ai";
import type { RunCap } from "@/lib/config";
import type { Meter } from "@/lib/ai-meter";

/**
 * The eval's local AI-call meter: the per-run meter (`src/lib/ai-meter.ts`, shared with the seed)
 * capped at 60 calls or $1. `aiGenerate` hands it each call's worst case (`worstCaseCost`: prompt
 * chars ÷ 3 at the dearer input price, plus the module's output cap, 1,000 tokens for the Matcher
 * and 1,500 for the Evaluator, at the output price) before sending, and what the call actually
 * cost after.
 */

export { CapReachedError, createMeter, type Meter } from "@/lib/ai-meter";

/** A per-run cap on AI calls and spend. */
export type EvalCap = RunCap;

export const EVAL_CAP: EvalCap = { maxCalls: 60, maxCostUsd: 1 };

/**
 * For an offline estimate: counts every call at its worst case, under the same cap rule as a live
 * run, and ignores the (zero) actual cost the offline model reports.
 */
export function worstCaseMeter(meter: Meter): AiMeter {
  return {
    beforeCall(worstCaseUsd) {
      meter.beforeCall(worstCaseUsd);
      meter.afterCall(worstCaseUsd);
    },
    afterCall() {},
  };
}

/**
 * The offline model's answer for estimates: the Matcher saying "no match, new Problem". Every
 * Request becoming a new Problem makes the Problem list (and so the prompts) as long as it can
 * get, so estimates err high.
 */
export const ESTIMATE_ANSWER = JSON.stringify({
  matchedProblemId: null,
  confidence: 0,
  reason: "Offline estimate: no AI call was made.",
  newProblem: { title: "Estimate placeholder", need: "I need an estimate placeholder." },
  closestProblem: null,
});

/**
 * The offline model's answer to the Evaluator for estimates. The worst case is priced from the
 * prompt and the output cap, not from this answer, so any valid Evaluation will do.
 */
export const ESTIMATE_EVALUATION = JSON.stringify(
  Object.fromEntries(
    ["impact", "strategicFit", "effort", "risk"].map((key) => [
      key,
      { score: 1, reason: "Offline estimate: no AI call was made." },
    ]),
  ),
);

import type { AiMeter } from "@/lib/ai";

/**
 * The eval's local AI-call meter: counts calls and cost, and refuses a call that would go over
 * the per-run cap (60 calls or $1). It plugs into `aiGenerate` (an `AiMeter`), which hands it each
 * call's worst case (prompt chars ÷ 4 at the input price, plus the module's output cap, 1,000
 * tokens for the Matcher and 1,500 for the Evaluator, at the output price) before sending, and
 * what the call actually cost after.
 */

/** A per-run cap on AI calls and spend. */
export type EvalCap = { maxCalls: number; maxCostUsd: number };

export const EVAL_CAP: EvalCap = { maxCalls: 60, maxCostUsd: 1 };

export class CapReachedError extends Error {
  name = "CapReachedError";
}

export type Meter = AiMeter & { totals: () => { calls: number; costUsd: number } };

export function createMeter(cap: EvalCap): Meter {
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

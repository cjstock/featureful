import type { AiMeter } from "@/lib/ai";
import type { RunCap } from "@/lib/config";

/**
 * A per-run AI-call meter, for runs outside the daily app budget (the eval and the seed): counts
 * calls and cost, and refuses a call that could go over the run's cap. It plugs into `aiGenerate`
 * (an `AiMeter`), which hands it each call's worst case (`worstCaseCost`) before sending, and what
 * the call actually cost after.
 */

export class CapReachedError extends Error {
  name = "CapReachedError";
}

export type Meter = AiMeter & { totals: () => { calls: number; costUsd: number } };

/** `run` names the run in refusals ("Eval cap reached: …"). */
export function createMeter(cap: RunCap, run = "Eval"): Meter {
  let calls = 0;
  let costUsd = 0;
  return {
    /** Call before each AI call with its worst-case cost; throws `CapReachedError` rather than risk the cap. */
    beforeCall(estimatedCostUsd: number) {
      if (calls >= cap.maxCalls) {
        throw new CapReachedError(`${run} cap reached: ${cap.maxCalls} AI calls already made this run.`);
      }
      if (costUsd + estimatedCostUsd > cap.maxCostUsd) {
        throw new CapReachedError(
          `${run} cap reached: $${costUsd.toFixed(4)} spent and the next call (up to $${estimatedCostUsd.toFixed(4)}) would pass $${cap.maxCostUsd}.`,
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

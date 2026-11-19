import { model } from "@/lib/ai";
import type { ModelPrices } from "@/lib/config";
import { costOf, MATCHER_MAX_OUTPUT_TOKENS, worstCaseCallCost, type Meter, type TokenUsage } from "./meter";

/**
 * A temporary seam onto the one shared `model` (src/lib/ai.ts) that every
 * Matcher call goes through, so the eval can meter, cap or stand in for each
 * call without changing the Matcher. It replaces `doGenerate` on that instance
 * for the rest of the process (the eval script and its tests only). The
 * AI-call-seam slice replaces this with `aiGenerate`.
 */

type DoGenerate = typeof model.doGenerate;
export type CallOptions = Parameters<DoGenerate>[0];
export type GenerateResult = Awaited<ReturnType<DoGenerate>>;
/** Handles one call; `next` sends it (with the given options) to the real model. */
export type GenerateHandler = (
  options: CallOptions,
  next: (options: CallOptions) => Promise<GenerateResult>,
) => Promise<GenerateResult>;

/** Route every call on the shared model through `handler`. Returns a function that undoes it. */
export function interceptModel(handler: GenerateHandler): () => void {
  const original = model.doGenerate;
  model.doGenerate = (options) => handler(options, async (sent) => original.call(model, sent));
  return () => {
    model.doGenerate = original;
  };
}

/** Characters the model is sent for a call: the prompt (system and messages) and the output schema. */
export function promptChars(options: CallOptions): number {
  return JSON.stringify(options.prompt).length + JSON.stringify(options.responseFormat ?? null).length;
}

/** The provider's usage report as the meter's token counts (missing counts are 0). */
export function toTokenUsage(usage: GenerateResult["usage"]): TokenUsage {
  const cacheRead = usage.inputTokens.cacheRead ?? 0;
  const cacheWrite = usage.inputTokens.cacheWrite ?? 0;
  return {
    input: {
      noCache: usage.inputTokens.noCache ?? Math.max(0, (usage.inputTokens.total ?? 0) - cacheRead - cacheWrite),
      cacheRead,
      cacheWrite,
    },
    output: usage.outputTokens.total ?? 0,
  };
}

/**
 * A stand-in answer for offline cost estimates: the Matcher's structured output
 * saying "no match, new Problem". Every Request becoming a new Problem makes the
 * Problem list (and so the prompts) as long as it can get, so estimates err high.
 */
export function cannedNewProblem(): GenerateResult {
  const text = JSON.stringify({
    matchedProblemId: null,
    confidence: 0,
    reason: "Offline estimate: no AI call was made.",
    newProblem: { title: "Estimate placeholder", need: "I need an estimate placeholder." },
  });
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "end_turn" },
    usage: {
      inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
    warnings: [],
  };
}

/**
 * The live eval's handler: refuses a call whose worst case would pass the cap,
 * caps the answer at the Matcher's 1,000 output tokens (so the worst case holds),
 * sends it, and meters what it actually cost.
 */
export function meteredCalls(meter: Meter, prices: ModelPrices): GenerateHandler {
  return async (options, next) => {
    meter.beforeCall(worstCaseCallCost(promptChars(options), prices));
    const result = await next({ ...options, maxOutputTokens: MATCHER_MAX_OUTPUT_TOKENS });
    meter.afterCall(costOf(toTokenUsage(result.usage), prices));
    return result;
  };
}

import { createHash } from "node:crypto";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type { Db } from "@/db";
import { aiCalls, type AiCallOutcome, type AiCallSource, type AiRelatedType, type CallableAiModule } from "@/db/schema";
import { CLAUDE_MODEL, MODEL_PRICES, type ModelPrices } from "./config";

/**
 * The one AI call seam. Every AI call goes through `aiGenerate`, the only code allowed to import
 * `ai` or `@ai-sdk/*` (ESLint `no-restricted-imports`). It sends one attempt (no retries), caps
 * the output per module, and records each attempt as an AI call row, whatever its outcome.
 */

/** A language model object (the real Anthropic one, or a test or offline stand-in). */
export type AiModel = Exclude<LanguageModel, string>;

/**
 * Checks spend around each AI call (the eval's per-run cap). `beforeCall` gets the call's worst
 * case and throws to refuse it; `afterCall` gets what a sent call actually cost.
 */
export type AiMeter = {
  beforeCall(worstCaseUsd: number): void;
  afterCall(costUsd: number): void;
};

/** Who an AI call is made for, and how: one per entry point (an app request, the seed, an eval run). */
export type AiCaller = {
  source: AiCallSource;
  /** The person who triggered it; null for the seed and evals. */
  person: number | null;
  /** Defaults to the configured Claude model. Tests and offline estimates pass a stand-in. */
  model?: AiModel;
  meter?: AiMeter;
};

/** An app AI call made on behalf of the current person. */
export const appCaller = (personId: number): AiCaller => ({ source: "app", person: personId });

export type AiRelated = { type: AiRelatedType; id: number } | null;

export type AiGenerateParams<S extends z.ZodType> = AiCaller & {
  /** Where the AI call row is written. */
  db: Db;
  /** Retired modules (ADR 0003) are not accepted: they make no new AI calls. */
  module: CallableAiModule;
  related: AiRelated;
  system: string;
  prompt: string;
  schema: S;
  maxOutputTokens: number;
  /** Matcher only: the structured Problems in its prompt. */
  shownProblems?: unknown;
};

export type AiCallRef = { id: number; promptVersion: string };

export type TokenUsage = {
  input: { noCache: number; cacheRead: number; cacheWrite: number };
  output: number;
};

const NO_TOKENS: TokenUsage = { input: { noCache: 0, cacheRead: 0, cacheWrite: 0 }, output: 0 };
const PER_TOKEN = 1 / 1_000_000;

/** The AI call recorded for each error `aiGenerate` threw (the error itself is rethrown unchanged). */
const recordedFailures = new WeakMap<object, { id: number; outcome: AiCallOutcome }>();

/**
 * The AI call record `aiGenerate` wrote for an error it threw: its id and outcome (e.g.
 * `refused_budget`). Undefined for any other error, or if the record couldn't be written.
 */
export function failedAiCall(error: unknown): { id: number; outcome: AiCallOutcome } | undefined {
  return typeof error === "object" && error !== null ? recordedFailures.get(error) : undefined;
}

/** A short hash of a module's system prompt: the prompt version. */
export function promptVersion(system: string): string {
  return createHash("sha256").update(system).digest("hex").slice(0, 8);
}

/** What an AI call cost, from its token usage and per-million-token prices. */
export function aiCallCost(usage: TokenUsage, prices: ModelPrices): number {
  return (
    (usage.input.noCache * prices.input +
      usage.input.cacheRead * prices.cacheRead +
      usage.input.cacheWrite * prices.cacheWrite +
      usage.output * prices.output) *
    PER_TOKEN
  );
}

/** The most an AI call can cost: prompt characters ÷ 4 as input tokens, plus a full answer at the output cap. */
export function worstCaseCost(promptChars: number, maxOutputTokens: number, prices: ModelPrices): number {
  return ((promptChars / 4) * prices.input + maxOutputTokens * prices.output) * PER_TOKEN;
}

let defaultModel: AiModel | undefined;
/** The configured Claude model. The provider reads ANTHROPIC_API_KEY from the environment (.env). */
function claude(): AiModel {
  return (defaultModel ??= anthropic(CLAUDE_MODEL));
}

type SdkUsage = {
  inputTokens: number | undefined;
  inputTokenDetails: {
    noCacheTokens: number | undefined;
    cacheReadTokens: number | undefined;
    cacheWriteTokens: number | undefined;
  };
  outputTokens: number | undefined;
};

function toTokenUsage(usage: SdkUsage | undefined): TokenUsage {
  if (!usage) return NO_TOKENS;
  const cacheRead = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens ?? 0;
  return {
    input: {
      noCache:
        usage.inputTokenDetails?.noCacheTokens ?? Math.max(0, (usage.inputTokens ?? 0) - cacheRead - cacheWrite),
      cacheRead,
      cacheWrite,
    },
    output: usage.outputTokens ?? 0,
  };
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Make one structured-output AI call and record it. Returns the parsed output and the AI call's
 * id and prompt version. On any failure (a model with no price, refused by the meter, an API
 * error, or output that doesn't fit `schema`) the AI call is still recorded and the error is
 * rethrown unchanged. If the row itself can't be written after a failure, that is logged and the
 * original error is still the one thrown. A sent call is always reported to the meter.
 */
export async function aiGenerate<S extends z.ZodType>(
  params: AiGenerateParams<S>,
): Promise<{ output: z.infer<S>; aiCall: AiCallRef }> {
  const { db, module, related, system, prompt, schema, maxOutputTokens, source, person, meter } = params;
  const model = params.model ?? claude();
  const prices: ModelPrices | undefined = MODEL_PRICES[model.modelId];
  const version = promptVersion(system);

  const record = (
    outcome: AiCallOutcome,
    fields: { usage?: TokenUsage; latencyMs?: number; output?: string | null; error?: string },
  ): AiCallRef => {
    const usage = fields.usage ?? NO_TOKENS;
    const id = db
      .insert(aiCalls)
      .values({
        module,
        model: model.modelId,
        promptVersion: version,
        inputNoCache: usage.input.noCache,
        cacheRead: usage.input.cacheRead,
        cacheWrite: usage.input.cacheWrite,
        outputTokens: usage.output,
        costUsd: prices ? aiCallCost(usage, prices) : 0,
        latencyMs: Math.round(fields.latencyMs ?? 0),
        outcome,
        error: fields.error ?? null,
        relatedType: related?.type ?? null,
        relatedId: related?.id ?? null,
        personId: person,
        source,
        system,
        prompt,
        output: fields.output ?? null,
        shownProblems: params.shownProblems ?? null,
      })
      .returning({ id: aiCalls.id })
      .get().id;
    return { id, promptVersion: version };
  };

  /** Record a failed AI call, then throw `error` itself, even if the record can't be written. */
  const fail = (outcome: AiCallOutcome, error: unknown, fields: Parameters<typeof record>[1] = {}): never => {
    try {
      const { id } = record(outcome, { ...fields, error: fields.error ?? errorMessage(error) });
      if (typeof error === "object" && error !== null) recordedFailures.set(error, { id, outcome });
    } catch (recordError) {
      console.error(`Couldn't record a ${outcome} ${module} AI call`, recordError);
    }
    throw error;
  };

  if (!prices) {
    return fail("error", new Error(`No price for model ${model.modelId} in src/lib/config.ts; refusing an unmetered AI call.`));
  }
  const priced = prices;

  if (meter) {
    let worstCase: number;
    try {
      const promptChars = system.length + prompt.length + JSON.stringify(z.toJSONSchema(schema)).length;
      worstCase = worstCaseCost(promptChars, maxOutputTokens, priced);
    } catch (error) {
      return fail("error", error);
    }
    try {
      meter.beforeCall(worstCase);
    } catch (error) {
      return fail("refused_budget", error);
    }
  }

  const started = performance.now();
  let result;
  try {
    result = await generateText({
      model,
      system,
      prompt,
      output: Output.object({ schema }),
      maxOutputTokens,
      maxRetries: 0,
    });
  } catch (error) {
    const latencyMs = performance.now() - started;
    if (NoObjectGeneratedError.isInstance(error)) {
      const usage = toTokenUsage(error.usage);
      meter?.afterCall(aiCallCost(usage, priced));
      return fail("parse_failed", error, { usage, latencyMs, output: error.text ?? null, error: error.message });
    }
    meter?.afterCall(0);
    return fail("error", error, { latencyMs });
  }
  const usage = toTokenUsage(result.usage);
  meter?.afterCall(aiCallCost(usage, priced));
  const aiCall = record("ok", { usage, latencyMs: performance.now() - started, output: result.text });
  return { output: result.output as z.infer<S>, aiCall };
}

/**
 * A model that never calls the network: it answers every AI call with `text` and reports no
 * tokens. Priced as the configured Claude model. For offline cost estimates.
 */
export function offlineModel(text: string): AiModel {
  return {
    specificationVersion: "v4",
    provider: "featureful.offline",
    modelId: CLAUDE_MODEL,
    supportedUrls: {},
    async doGenerate() {
      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage: {
          inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 0, text: 0, reasoning: 0 },
        },
        warnings: [],
      };
    },
    async doStream() {
      throw new Error("The offline model doesn't stream.");
    },
  };
}

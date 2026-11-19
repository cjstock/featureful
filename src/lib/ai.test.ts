/**
 * aiGenerate, the one AI call seam, against a mock model: every attempt leaves an AI call row,
 * failures reach the caller unchanged, and cost follows the price table. No network calls.
 */
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createDb, type Db } from "@/db";
import { aiCalls, people } from "@/db/schema";
import {
  aiCallCost,
  aiGenerate,
  promptVersion,
  worstCaseCost,
  type AiMeter,
} from "@/lib/ai";

const prices = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 };
const schema = z.object({ answer: z.string() });

const usage = {
  inputTokens: { total: 1_600, noCache: 1_000, cacheRead: 500, cacheWrite: 100 },
  outputTokens: { total: 200, text: 200, reasoning: 0 },
};

type DoGenerate = NonNullable<ConstructorParameters<typeof MockLanguageModelV4>[0]>["doGenerate"];

function mockModel(doGenerate: DoGenerate) {
  return new MockLanguageModelV4({ modelId: "claude-sonnet-5-5", doGenerate });
}

const answering = (text: string) =>
  mockModel(async () => ({
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "end_turn" },
    usage,
    warnings: [],
  }));

let db: Db;
let pmId: number;
beforeEach(() => {
  db = createDb(":memory:");
  pmId = db.insert(people).values({ name: "Sam", role: "pm" }).returning().get().id;
});

const base = () => ({
  db,
  module: "evaluator" as const,
  related: { type: "problem" as const, id: 7 },
  person: pmId,
  source: "app" as const,
  system: "You score Problems.",
  prompt: "Problem: Repeat a brew",
  schema,
  maxOutputTokens: 1_500,
});

describe("aiGenerate", () => {
  it("returns the parsed output and records an ok AI call with tokens, cost, content and prompt version", async () => {
    const model = answering('{"answer":"yes"}');

    const { output, aiCall } = await aiGenerate({ ...base(), model });

    expect(output).toEqual({ answer: "yes" });
    const rows = db.select().from(aiCalls).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: aiCall.id,
      module: "evaluator",
      model: "claude-sonnet-5-5",
      promptVersion: promptVersion("You score Problems."),
      inputNoCache: 1_000,
      cacheRead: 500,
      cacheWrite: 100,
      outputTokens: 200,
      outcome: "ok",
      error: null,
      relatedType: "problem",
      relatedId: 7,
      personId: pmId,
      source: "app",
      system: "You score Problems.",
      prompt: "Problem: Repeat a brew",
      output: '{"answer":"yes"}',
    });
    // 1,000 × $2 + 500 × $0.10 + 100 × $2.50 + 200 × $10, per million tokens.
    expect(rows[0].costUsd).toBeCloseTo(0.0043, 8);
    expect(rows[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(aiCall.promptVersion).toBe(rows[0].promptVersion);
  });

  it("sends one attempt with no retries and the module's output cap", async () => {
    let attempts = 0;
    const model = mockModel(async () => {
      attempts++;
      throw Object.assign(new Error("overloaded"), { isRetryable: true });
    });

    await expect(aiGenerate({ ...base(), model })).rejects.toThrow("overloaded");
    expect(attempts).toBe(1);

    const ok = answering('{"answer":"yes"}');
    await aiGenerate({ ...base(), model: ok });
    expect(ok.doGenerateCalls[0].maxOutputTokens).toBe(1_500);
  });

  it("records an error row and rethrows the same error to the caller", async () => {
    const failure = new Error("Anthropic API is down");
    const model = mockModel(async () => {
      throw failure;
    });

    const thrown = await aiGenerate({ ...base(), model }).catch((error) => error);

    expect(thrown).toBe(failure);
    expect(db.select().from(aiCalls).all()).toEqual([
      expect.objectContaining({
        outcome: "error",
        error: "Anthropic API is down",
        output: null,
        costUsd: 0,
        relatedId: 7,
        prompt: "Problem: Repeat a brew",
      }),
    ]);
  });

  it("records a parse_failed row, with the raw output and its billed tokens, when the output doesn't fit the schema", async () => {
    const model = answering('{"wrong":1}');

    const thrown = await aiGenerate({ ...base(), model }).catch((error) => error);

    // The SDK's own NoObjectGeneratedError, not a wrapper: it still carries the raw text and usage.
    expect(thrown.name).toBe("AI_NoObjectGeneratedError");
    expect(thrown.text).toBe('{"wrong":1}');
    expect(thrown.usage.outputTokens).toBe(200);
    const [row] = db.select().from(aiCalls).all();
    expect(row).toMatchObject({
      outcome: "parse_failed",
      output: '{"wrong":1}',
      inputNoCache: 1_000,
      outputTokens: 200,
    });
    expect(row.error).toBeTruthy();
    expect(row.costUsd).toBeCloseTo(0.0043, 8);
  });

  it("stores the Problems shown to the Matcher", async () => {
    const shown = [{ id: 1, title: "Repeat a brew", need: "I need to repeat a brew." }];
    await aiGenerate({ ...base(), module: "matcher", related: null, shownProblems: shown, model: answering('{"answer":"x"}') });
    expect(db.select().from(aiCalls).get()).toMatchObject({ module: "matcher", relatedType: null, shownProblems: shown });
  });

  it("lets a meter refuse a call before it is sent, recording it as refused_budget", async () => {
    const model = answering('{"answer":"yes"}');
    const seen: number[] = [];
    const refusal = new Error("Eval cap reached");
    const meter: AiMeter = {
      beforeCall(worstCaseUsd) {
        seen.push(worstCaseUsd);
        throw refusal;
      },
      afterCall() {},
    };

    expect(await aiGenerate({ ...base(), model, meter }).catch((error) => error)).toBe(refusal);

    expect(model.doGenerateCalls).toHaveLength(0);
    expect(seen[0]).toBeGreaterThan(0.015); // at least 1,500 output tokens at $10/MTok
    expect(db.select().from(aiCalls).get()).toMatchObject({ outcome: "refused_budget", error: "Eval cap reached" });
  });

  it("tells the meter what each sent call actually cost", async () => {
    const costs: number[] = [];
    const meter: AiMeter = { beforeCall() {}, afterCall: (cost) => costs.push(cost) };
    await aiGenerate({ ...base(), model: answering('{"answer":"yes"}'), meter });
    await aiGenerate({ ...base(), model: answering("not json"), meter }).catch(() => {});
    expect(costs).toEqual([expect.closeTo(0.0043, 8), expect.closeTo(0.0043, 8)]);
  });

  it("refuses a model with no price in the table, without sending anything, recording an error row", async () => {
    const model = new MockLanguageModelV4({ modelId: "unpriced-model" });
    await expect(aiGenerate({ ...base(), model })).rejects.toThrow(/no price/i);
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(db.select().from(aiCalls).get()).toMatchObject({
      outcome: "error",
      model: "unpriced-model",
      costUsd: 0,
      error: expect.stringMatching(/no price/i),
    });
  });

  it("records an error row, without sending, when the schema can't be sized for the worst case", async () => {
    const model = answering('{"when":"x"}');
    const meter: AiMeter = { beforeCall() {}, afterCall() {} };
    const unrepresentable = z.object({ when: z.date() });

    await expect(aiGenerate({ ...base(), schema: unrepresentable, model, meter })).rejects.toThrow();

    expect(model.doGenerateCalls).toHaveLength(0);
    expect(db.select().from(aiCalls).get()).toMatchObject({ outcome: "error" });
  });

  it("still rethrows the original error when the AI call row can't be written", async () => {
    const failure = new Error("Anthropic API is down");
    const model = mockModel(async () => {
      throw failure;
    });
    const refusal = new Error("Eval cap reached");
    const refusing: AiMeter = {
      beforeCall() {
        throw refusal;
      },
      afterCall() {},
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db.$client.close();
    // An eval run: an app call would stop earlier, at the AI controls (next test).
    const evalRun = { ...base(), source: "eval" as const };

    expect(await aiGenerate({ ...evalRun, model }).catch((error) => error)).toBe(failure);
    expect(await aiGenerate({ ...evalRun, model, meter: refusing }).catch((error) => error)).toBe(refusal);
    expect(logged).toHaveBeenCalledTimes(2);
    logged.mockRestore();
  });

  it("doesn't send an app call when the AI controls (off switch, today's spend) can't be read", async () => {
    const model = answering('{"answer":"yes"}');
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db.$client.close();

    await expect(aiGenerate({ ...base(), model })).rejects.toThrow(/not open/);

    expect(model.doGenerateCalls).toHaveLength(0);
    logged.mockRestore();
  });

  it("meters a paid call even when its row can't be written", async () => {
    const costs: number[] = [];
    const meter: AiMeter = { beforeCall() {}, afterCall: (cost) => costs.push(cost) };
    const model = answering('{"answer":"yes"}');
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db.$client.close();

    const evalRun = { ...base(), source: "eval" as const };
    await expect(aiGenerate({ ...evalRun, model, meter })).rejects.toThrow();
    await expect(aiGenerate({ ...evalRun, model: answering("not json"), meter })).rejects.toThrow();

    expect(costs).toEqual([expect.closeTo(0.0043, 8), expect.closeTo(0.0043, 8)]);
    logged.mockRestore();
  });
});

describe("cost maths", () => {
  it("prices uncached, cache-read, cache-write and output tokens per million", () => {
    expect(
      aiCallCost({ input: { noCache: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000 }, output: 100_000 }, prices),
    ).toBeCloseTo(2 + 0.1 + 2.5 + 1);
  });

  it("prices the worst case as prompt characters ÷ 4 plus a full answer at the output cap", () => {
    // 4,000 chars = 1,000 input tokens = $0.002; 1,000 output tokens = $0.01.
    expect(worstCaseCost(4_000, 1_000, prices)).toBeCloseTo(0.012);
  });
});

describe("promptVersion", () => {
  it("is a short stable hash that changes with the system prompt", () => {
    expect(promptVersion("a")).toBe(promptVersion("a"));
    expect(promptVersion("a")).not.toBe(promptVersion("b"));
    expect(promptVersion("a")).toMatch(/^[0-9a-f]{8}$/);
  });
});

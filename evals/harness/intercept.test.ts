/**
 * The interceptor must catch the real Matcher's calls, or the eval's cap and
 * meter would be bypassed. Offline: the API key is removed, so a call that
 * slipped past the interceptor would fail rather than spend.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { llmMatcher } from "@/lib/intake/llm-matcher";
import { cannedNewProblem, interceptModel, meteredCalls, promptChars, type CallOptions } from "./intercept";
import { CapReachedError, createMeter, EVAL_CAP } from "./meter";

beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

let restore = () => {};
afterEach(() => restore());

describe("interceptModel", () => {
  it("routes the unchanged llmMatcher through the handler, which can stand in for the call", async () => {
    const seen: number[] = [];
    restore = interceptModel(async (options) => {
      seen.push(promptChars(options));
      return cannedNewProblem();
    });

    const result = await llmMatcher(
      { title: "Bloom timer", description: "Count down the bloom for me." },
      [{ id: 1, title: "Export roasts", need: "I need my roast logs out of the app.", boundaryNote: null }],
      [],
    );

    expect(result.match).toBeNull();
    expect(result.newProblem.title).toBe("Estimate placeholder");
    expect(seen).toHaveLength(1);
    // The prompt includes the Matcher's system prompt, the Problem list and the Request.
    expect(seen[0]).toBeGreaterThan(2_000);
  });
});

describe("meteredCalls", () => {
  const prices = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 };
  const usage = {
    inputTokens: { total: 1_000, noCache: 1_000, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 100, text: 100, reasoning: 0 },
  };

  it("caps each call's output at the Matcher's 1,000 tokens and meters its actual cost", async () => {
    const meter = createMeter(EVAL_CAP);
    const sent: CallOptions[] = [];
    const handler = meteredCalls(meter, prices);

    await handler({ prompt: [] } as unknown as CallOptions, async (options) => {
      sent.push(options);
      return { ...cannedNewProblem(), usage };
    });

    expect(sent[0].maxOutputTokens).toBe(1_000);
    // 1,000 input tokens at $2/MTok + 100 output tokens at $10/MTok.
    expect(meter.totals()).toEqual({ calls: 1, costUsd: expect.closeTo(0.003, 6) });
  });

  it("refuses a call whose worst case would pass the cap, without sending it", async () => {
    const meter = createMeter({ maxCalls: 60, maxCostUsd: 0.005 });
    let sent = 0;
    const handler = meteredCalls(meter, prices);
    const call = handler({ prompt: [] } as unknown as CallOptions, async () => {
      sent++;
      return cannedNewProblem();
    });
    await expect(call).rejects.toThrow(CapReachedError);
    expect(sent).toBe(0);
  });
});

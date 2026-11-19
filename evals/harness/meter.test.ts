import { describe, expect, it } from "vitest";
import { CapReachedError, costOf, createMeter, MATCHER_MAX_OUTPUT_TOKENS, worstCaseCallCost } from "./meter";

const prices = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 };

describe("costOf", () => {
  it("prices uncached, cache-read, cache-write and output tokens per million", () => {
    const cost = costOf(
      { input: { noCache: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000 }, output: 100_000 },
      prices,
    );
    expect(cost).toBeCloseTo(2 + 0.1 + 2.5 + 1);
  });
});

describe("worstCaseCallCost", () => {
  it("prices the prompt at four characters a token plus a full 1,000-token answer", () => {
    // 4,000 chars = 1,000 input tokens = $0.002; 1,000 output tokens = $0.01.
    expect(MATCHER_MAX_OUTPUT_TOKENS).toBe(1_000);
    expect(worstCaseCallCost(4_000, prices)).toBeCloseTo(0.012);
  });
});

describe("createMeter", () => {
  it("adds up calls and cost", () => {
    const meter = createMeter({ maxCalls: 60, maxCostUsd: 1 });
    meter.beforeCall(0.01);
    meter.afterCall(0.02);
    meter.beforeCall(0.01);
    meter.afterCall(0.03);
    expect(meter.totals()).toEqual({ calls: 2, costUsd: 0.05 });
  });

  it("refuses the call after the call cap", () => {
    const meter = createMeter({ maxCalls: 2, maxCostUsd: 1 });
    meter.beforeCall(0);
    meter.beforeCall(0);
    expect(() => meter.beforeCall(0)).toThrow(CapReachedError);
    expect(meter.totals().calls).toBe(2);
  });

  it("refuses a call whose estimate would take spend over the cost cap", () => {
    const meter = createMeter({ maxCalls: 60, maxCostUsd: 1 });
    meter.beforeCall(0.5);
    meter.afterCall(0.9);
    expect(() => meter.beforeCall(0.2)).toThrow(/\$1/);
  });
});

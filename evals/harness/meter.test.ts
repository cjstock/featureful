import { describe, expect, it } from "vitest";
import { CapReachedError, createMeter, worstCaseMeter } from "./meter";

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

describe("worstCaseMeter", () => {
  it("counts each call at its worst case and ignores the reported cost", () => {
    const meter = createMeter({ maxCalls: 60, maxCostUsd: 1 });
    const estimate = worstCaseMeter(meter);
    estimate.beforeCall(0.4);
    estimate.afterCall(0);
    estimate.beforeCall(0.4);
    expect(meter.totals()).toEqual({ calls: 2, costUsd: 0.8 });
    expect(() => estimate.beforeCall(0.4)).toThrow(CapReachedError);
  });
});

import { describe, expect, it } from "vitest";
import { scorePriority, type CriterionKey, type PriorityScore } from "./scoring";

const criterion = (score: PriorityScore, key: CriterionKey) =>
  score.breakdown.find((c) => c.criterion === key)!;

/** Fully evaluated Problem where every AI criterion is neutral-ish; tests override what they need. */
const evaluated = { impact: 3, strategicFit: 3, effort: 3, risk: 3 };

describe("Demand thresholds", () => {
  it.each([
    [0, 1],
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 3],
    [5, 3],
    [6, 4],
    [8, 4],
    [9, 5],
    [250, 5],
  ])("%i supporters map to Demand %i", (supporterCount, level) => {
    const score = scorePriority({ supporterCount, ...evaluated });
    expect(criterion(score, "demand").score).toBe(level);
  });
});

describe("Effort and Risk inversion", () => {
  it("lowest Effort and Risk earn their full weight", () => {
    const score = scorePriority({ supporterCount: 1, impact: 1, strategicFit: 1, effort: 1, risk: 1 });
    expect(criterion(score, "effort")).toMatchObject({ score: 1, adjusted: 5, points: 15 });
    expect(criterion(score, "risk")).toMatchObject({ score: 1, adjusted: 5, points: 15 });
    expect(score.computedTotal).toBe(30);
  });

  it("highest Effort and Risk earn nothing", () => {
    const score = scorePriority({ supporterCount: 1, impact: 1, strategicFit: 1, effort: 5, risk: 5 });
    expect(criterion(score, "effort")).toMatchObject({ adjusted: 1, points: 0 });
    expect(criterion(score, "risk")).toMatchObject({ adjusted: 1, points: 0 });
    expect(score.computedTotal).toBe(0);
  });

  it("Impact and Strategic fit are not inverted", () => {
    const score = scorePriority({ supporterCount: 1, impact: 5, strategicFit: 5, effort: 5, risk: 5 });
    expect(criterion(score, "impact")).toMatchObject({ score: 5, adjusted: 5, points: 25 });
    expect(criterion(score, "strategicFit")).toMatchObject({ score: 5, adjusted: 5, points: 20 });
    expect(score.computedTotal).toBe(45);
  });
});

describe("Weighting", () => {
  it("uses the default weights Demand 25, Impact 25, Strategic fit 20, Effort 15, Risk 15", () => {
    const score = scorePriority({ supporterCount: 9, impact: 1, strategicFit: 1, effort: 5, risk: 5 });
    expect(score.breakdown.map((c) => [c.criterion, c.weight])).toEqual([
      ["demand", 25],
      ["impact", 25],
      ["strategicFit", 20],
      ["effort", 15],
      ["risk", 15],
    ]);
    expect(criterion(score, "demand").points).toBe(25);
    expect(score.computedTotal).toBe(25);
  });

  it("normalizes each criterion as (s - 1) / 4 before weighting (worked example)", () => {
    // Demand 3 -> 12.5, Impact 4 -> 18.75, Fit 2 -> 5, Effort 2 (inv 4) -> 11.25, Risk 3 (inv 3) -> 7.5
    const score = scorePriority({ supporterCount: 4, impact: 4, strategicFit: 2, effort: 2, risk: 3 });
    expect(score.breakdown.map((c) => c.points)).toEqual([12.5, 18.75, 5, 11.25, 7.5]);
    expect(score.computedTotal).toBe(55);
    expect(score.total).toBe(55);
  });

  it("accepts custom weights and scales them to 0-100", () => {
    const weights = { demand: 1, impact: 1, strategicFit: 0, effort: 0, risk: 0 };
    const score = scorePriority({ supporterCount: 9, impact: 1, strategicFit: 5, effort: 1, risk: 1, weights });
    expect(score.computedTotal).toBe(50);
  });
});

describe("Bounds", () => {
  it("the best possible Problem scores exactly 100", () => {
    const score = scorePriority({ supporterCount: 50, impact: 5, strategicFit: 5, effort: 1, risk: 1 });
    expect(score.computedTotal).toBe(100);
  });

  it("the worst possible Problem scores exactly 0", () => {
    const score = scorePriority({ supporterCount: 0, impact: 1, strategicFit: 1, effort: 5, risk: 5 });
    expect(score.computedTotal).toBe(0);
  });

  it("out-of-range AI scores are clamped to 1-5 so the total stays within 0-100", () => {
    const high = scorePriority({ supporterCount: 50, impact: 9, strategicFit: 7, effort: -3, risk: 0 });
    expect(high.computedTotal).toBe(100);
    const low = scorePriority({ supporterCount: 0, impact: -2, strategicFit: 0, effort: 12, risk: 8 });
    expect(low.computedTotal).toBe(0);
  });
});

describe("Not evaluated", () => {
  it("a Problem with no AI scores gets a Demand-only score flagged as not evaluated", () => {
    const score = scorePriority({ supporterCount: 9, impact: null, strategicFit: null, effort: null, risk: null });
    expect(score.evaluated).toBe(false);
    expect(score.computedTotal).toBe(25);
    expect(score.total).toBe(25);
    expect(criterion(score, "impact")).toMatchObject({ score: null, adjusted: null, points: 0 });
    expect(criterion(score, "effort")).toMatchObject({ score: null, adjusted: null, points: 0 });
  });

  it("a partially evaluated Problem is still flagged as not evaluated", () => {
    const score = scorePriority({ supporterCount: 1, impact: 5, strategicFit: null, effort: 1, risk: 1 });
    expect(score.evaluated).toBe(false);
    expect(score.computedTotal).toBe(55);
  });

  it("a fully evaluated Problem is flagged as evaluated", () => {
    expect(scorePriority({ supporterCount: 1, ...evaluated }).evaluated).toBe(true);
  });
});

describe("Override", () => {
  it("replaces the total while the computed total is still returned", () => {
    const score = scorePriority({ supporterCount: 4, impact: 4, strategicFit: 2, effort: 2, risk: 3, override: 90 });
    expect(score.total).toBe(90);
    expect(score.computedTotal).toBe(55);
    expect(score.overridden).toBe(true);
    expect(score.breakdown.map((c) => c.points)).toEqual([12.5, 18.75, 5, 11.25, 7.5]);
  });

  it("an override of 0 still counts as an override", () => {
    const score = scorePriority({ supporterCount: 9, ...evaluated, override: 0 });
    expect(score.total).toBe(0);
    expect(score.overridden).toBe(true);
  });

  it("a null override means the computed total applies", () => {
    const score = scorePriority({ supporterCount: 4, impact: 4, strategicFit: 2, effort: 2, risk: 3, override: null });
    expect(score.total).toBe(55);
    expect(score.overridden).toBe(false);
  });

  it("an out-of-range override is clamped to 0-100", () => {
    expect(scorePriority({ supporterCount: 1, ...evaluated, override: 140 }).total).toBe(100);
    expect(scorePriority({ supporterCount: 1, ...evaluated, override: -5 }).total).toBe(0);
  });

  it("applies to a Problem that is not yet evaluated", () => {
    const score = scorePriority({ supporterCount: 1, impact: null, strategicFit: null, effort: null, risk: null, override: 70 });
    expect(score).toMatchObject({ total: 70, computedTotal: 0, overridden: true, evaluated: false });
  });
});

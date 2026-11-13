import { describe, expect, it } from "vitest";
import { ROLES, STATUSES, VERDICTS } from "@/db/schema";
import { TONES, confidenceTone, criterionTone, priorityTone, roleTone, statusTone, verdictTone } from "./tones";

const scored = (total: number) => ({ total, evaluated: true, overridden: false });

describe("Priority score bands", () => {
  it.each([
    [100, "positive"],
    [70, "positive"],
    [69, "caution"],
    [40, "caution"],
    [39, "neutral"],
    [0, "neutral"],
  ])("a score of %i is %s", (total, tone) => {
    expect(priorityTone(scored(total))).toBe(tone);
  });

  it("an unevaluated Problem is not-evaluated, whatever its Demand-only total", () => {
    expect(priorityTone({ total: 25, evaluated: false, overridden: false })).toBe("not-evaluated");
  });

  it("an override is banded by its value even when the Problem is not evaluated", () => {
    expect(priorityTone({ total: 85, evaluated: false, overridden: true })).toBe("positive");
  });
});

describe("Match confidence bands", () => {
  it.each([
    [1, "positive"],
    [0.85, "positive"],
    [0.84, "caution"],
    [0.6, "caution"],
    [0.59, "negative"],
    [0, "negative"],
  ])("a confidence of %f is %s", (confidence, tone) => {
    expect(confidenceTone(confidence)).toBe(tone);
  });
});

describe("Criterion tones: how much a criterion helps the Priority score", () => {
  it.each(["demand", "impact", "strategicFit"] as const)("high %s helps, low %s hurts", (criterion) => {
    expect([1, 2, 3, 4, 5].map((s) => criterionTone(criterion, s))).toEqual([
      "negative",
      "negative",
      "caution",
      "positive",
      "positive",
    ]);
  });

  it.each(["effort", "risk"] as const)("%s is inverted: low helps, high hurts", (criterion) => {
    expect([1, 2, 3, 4, 5].map((s) => criterionTone(criterion, s))).toEqual([
      "positive",
      "positive",
      "caution",
      "negative",
      "negative",
    ]);
  });

  it("a criterion that isn't evaluated yet is neutral", () => {
    expect(criterionTone("impact", null)).toBe("neutral");
    expect(criterionTone("risk", null)).toBe("neutral");
  });
});

describe("Status, verdict and role tones", () => {
  it.each(STATUSES)("Status %s has its own tone", (status) => {
    expect(TONES).toContain(statusTone(status));
  });

  it("every Status gets a different tone", () => {
    expect(new Set(STATUSES.map(statusTone)).size).toBe(STATUSES.length);
  });

  it.each([
    ["confirm", "positive"],
    ["move", "info"],
    ["split", "caution"],
  ] as const)("verdict %s is %s", (verdict, tone) => {
    expect(verdictTone(verdict)).toBe(tone);
  });

  it("every verdict maps to a tone", () => {
    for (const v of VERDICTS) expect(TONES).toContain(verdictTone(v));
  });

  it.each(ROLES)("role %s has its own tone", (role) => {
    expect(TONES).toContain(roleTone(role));
  });

  it("every role gets a different tone", () => {
    expect(new Set(ROLES.map(roleTone)).size).toBe(ROLES.length);
  });
});

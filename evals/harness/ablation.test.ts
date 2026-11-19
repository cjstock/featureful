import { describe, expect, it } from "vitest";
import {
  type AblationArm,
  type ArmRun,
  boundaryWins,
  costPerRequest,
  decideBoundaryNotes,
  formatAblationReport,
  goldenRegressions,
} from "./ablation";
import { outcome } from "./fixtures";

const boundary = (id: string, passed: boolean) => outcome(id, 1, passed ? 1 : "new", { kind: "boundary" });

describe("boundaryWins", () => {
  it("counts the boundary cases answered right, ignoring golden cases", () => {
    expect(
      boundaryWins([boundary("b1", true), boundary("b2", false), boundary("b3", true), outcome("g1", 1, 1)]),
    ).toBe(2);
  });
});

describe("goldenRegressions", () => {
  it("names the golden cases that pass with examples only but fail with Boundary notes added", () => {
    const examplesOnly = [outcome("g1", 1, 1), outcome("g2", 2, 2), outcome("g3", 3, "new"), boundary("b1", true)];
    const withNotes = [outcome("g1", 1, "new"), outcome("g2", 2, 2), outcome("g3", 3, "new"), boundary("b1", false)];
    expect(goldenRegressions(examplesOnly, withNotes)).toEqual(["g1"]);
  });

  it("does not count a golden case that fails in both arms, or one only the notes arm ran", () => {
    expect(goldenRegressions([outcome("g1", 1, "new")], [outcome("g1", 1, "new"), outcome("g2", 2, "new")])).toEqual(
      [],
    );
  });
});

/** One arm's run: `wins` of 8 boundary cases right, and the golden cases as given (all passing by default). */
function armRun(arm: AblationArm, run: number, wins: number, golden = [outcome("g1", 1, 1), outcome("g2", 2, 2)]): ArmRun {
  const cases = Array.from({ length: 8 }, (_, i) => boundary(`b${i + 1}`, i < wins));
  return { arm, run, cases: arm === "a" ? cases : [...cases, ...golden], calls: cases.length, costUsd: 0.1 };
}

/** Two runs of all three arms, with the examples-only (b) and examples + notes (c) wins per run. */
function ablation(b: [number, number], c: [number, number], cGolden?: ReturnType<typeof outcome>[]) {
  return {
    runs: [1, 2].flatMap((run) => [
      armRun("a", run, 1),
      armRun("b", run, b[run - 1]),
      armRun("c", run, c[run - 1], cGolden),
    ]),
  };
}

describe("decideBoundaryNotes", () => {
  it("keeps the notes when they beat examples only by exactly 2 boundary cases on both runs", () => {
    expect(decideBoundaryNotes(ablation([4, 5], [6, 7]))).toBe("keep");
  });

  it("cuts them when the margin is 1 on either run", () => {
    expect(decideBoundaryNotes(ablation([4, 5], [6, 6]))).toBe("cut");
    expect(decideBoundaryNotes(ablation([4, 5], [5, 8]))).toBe("cut");
  });

  it("cuts them when they tie or lose", () => {
    expect(decideBoundaryNotes(ablation([6, 6], [6, 6]))).toBe("cut");
    expect(decideBoundaryNotes(ablation([6, 6], [3, 3]))).toBe("cut");
  });

  it("cuts them when a golden case regresses, however big the boundary margin", () => {
    expect(decideBoundaryNotes(ablation([2, 2], [8, 8], [outcome("g1", 1, 1), outcome("g2", 2, "new")]))).toBe("cut");
  });

  it("cuts them unless both runs are there", () => {
    const oneRun = { runs: ablation([4, 4], [8, 8]).runs.filter((r) => r.run === 1) };
    expect(decideBoundaryNotes(oneRun)).toBe("cut");
  });
});

describe("costPerRequest", () => {
  it("divides each arm's spend over both runs by the Requests it judged", () => {
    const runs: ArmRun[] = [
      { arm: "a", run: 1, cases: [boundary("b1", true), boundary("b2", true)], calls: 2, costUsd: 0.02 },
      { arm: "a", run: 2, cases: [boundary("b1", true), boundary("b2", true)], calls: 2, costUsd: 0.04 },
      { arm: "b", run: 1, cases: [boundary("b1", true)], calls: 1, costUsd: 0.03 },
    ];
    expect(costPerRequest({ runs })).toEqual({ a: 0.015, b: 0.03, c: 0 });
  });
});

describe("formatAblationReport", () => {
  it("shows wins per arm per run, the margin, golden regressions and the decision", () => {
    const report = formatAblationReport({
      ...ablation([4, 5], [6, 6], [outcome("g1", 1, 1), outcome("g2", 2, "new")]),
      boundaryCases: 8,
      goldenCases: 2,
    });
    expect(report).toContain("| Run 1 | 1 | 4 | 6 | +2 | g2 |");
    expect(report).toContain("| Run 2 | 1 | 5 | 6 | +1 | g2 |");
    expect(report).toContain("Decision by rule: **CUT**");
  });
});

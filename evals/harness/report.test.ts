import { describe, expect, it } from "vitest";
import { outcome, result } from "./fixtures";
import { costLine, formatReport } from "./report";

describe("formatReport", () => {
  const baseline = result({ cases: [outcome("g1", 1, 1), outcome("b1", "new", 3)] });
  const run = result({
    replay: { ...baseline.replay, f1: 0.75 },
    cases: [
      outcome("g1", 1, "new", { reason: "New Problem: Something else" }),
      outcome("b1", "new", "new"),
    ],
    costUsd: 0.21,
  });

  it("puts each score beside the baseline with the change", () => {
    const report = formatReport(run, baseline, { passed: true, breaches: [] });
    expect(report).toContain("| Replay F1 | 0.850 | 0.750 | -0.100 |");
    expect(report).toContain("| Problems created (of 16) | 17 | 17 | +0 |");
  });

  it("lists flipped cases with the old answer, new answer and the Matcher's reason", () => {
    const report = formatReport(run, baseline, { passed: true, breaches: [] });
    expect(report).toContain("| g1 | pass → fail | Problem #1 | new Problem | New Problem: Something else |");
    expect(report).toContain("| b1 | fail → pass | Problem #3 | new Problem | r |");
  });

  it("shows the gate verdict and every breach", () => {
    const report = formatReport(run, baseline, { passed: false, breaches: ["Replay F1 dropped."] });
    expect(report).toContain("FAIL");
    expect(report).toContain("- Replay F1 dropped.");
  });

  it("says when there is no baseline yet", () => {
    expect(formatReport(run, null, { passed: true, breaches: [] })).toContain("No baseline");
  });
});

describe("costLine", () => {
  it("states calls and cost against the cap", () => {
    expect(costLine({ calls: 39, costUsd: 0.1834 }, { maxCalls: 60, maxCostUsd: 1 })).toBe(
      "Cost: $0.1834 for 39 AI calls (cap: 60 calls or $1.00 per run).",
    );
  });
});

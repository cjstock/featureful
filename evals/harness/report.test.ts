import { describe, expect, it } from "vitest";
import { INJECTION } from "../evaluator/injection-pair";
import { injectionCheck, outcome, result } from "./fixtures";
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

  it("shows the Evaluator injection check beside the baseline's", () => {
    const failed = result({ injection: { ...injectionCheck(false), calls: 2, costUsd: 0.01 } });
    const report = formatReport(failed, result(), { passed: false, breaches: [] });
    expect(report).toContain(
      [
        "### Evaluator injection check: FAIL",
        "",
        `Clean Evidence vs the same Evidence with this planted in one Request: "${INJECTION}" (2 or more higher fails).`,
        "",
        "| Criterion | Clean | Injected | Baseline (clean → injected) |",
        "| --- | --- | --- | --- |",
        "| Impact | 2 | 5 | 2 → 3 |",
        "| Strategic fit | 1 | 2 | 1 → 2 |",
      ].join("\n"),
    );
  });

  it("marks the injection check as new when the baseline predates it", () => {
    const report = formatReport(result(), result({ injection: undefined }), { passed: true, breaches: [] });
    expect(report).toContain("### Evaluator injection check: PASS (new: not in the baseline)");
    expect(report).toContain("| Impact | 2 | 3 | — |");
    expect(report).toContain("It took 2 AI calls ($0.0100), included in this run's cost above.");
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

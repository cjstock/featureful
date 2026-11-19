import { describe, expect, it } from "vitest";
import { caseScores, pairwiseScores } from "./score";
import type { CaseAnswer } from "./types";

describe("pairwiseScores", () => {
  it("scores a worked example: one shared pair right, one wrong, two missed", () => {
    // Expected groups: a, b and c share a need; d is alone (3 expected pairs).
    // Predicted: {a, b} and {c, d} (2 predicted pairs, 1 of them right).
    const scores = pairwiseScores([
      { predicted: 1, expected: "x" },
      { predicted: 1, expected: "x" },
      { predicted: 2, expected: "x" },
      { predicted: 2, expected: "y" },
    ]);
    expect(scores.precision).toBeCloseTo(0.5);
    expect(scores.recall).toBeCloseTo(1 / 3);
    expect(scores.f1).toBeCloseTo(0.4);
  });

  it("scores a perfect grouping as 1 across the board", () => {
    expect(
      pairwiseScores([
        { predicted: 7, expected: "x" },
        { predicted: 7, expected: "x" },
        { predicted: 8, expected: "y" },
      ]),
    ).toEqual({ precision: 1, recall: 1, f1: 1 });
  });

  it("gives an all-singletons grouping recall 0 and F1 0", () => {
    expect(
      pairwiseScores([
        { predicted: 1, expected: "x" },
        { predicted: 2, expected: "x" },
        { predicted: 3, expected: "y" },
      ]),
    ).toEqual({ precision: 1, recall: 0, f1: 0 });
  });
});

describe("caseScores", () => {
  const outcome = (expected: CaseAnswer, answer: CaseAnswer) => ({ expected, answer });

  it("scores accuracy, match-vs-new accuracy and correct-Problem accuracy", () => {
    const scores = caseScores([
      outcome(1, 1), // right Problem
      outcome(1, 2), // matched, but the wrong Problem
      outcome(2, "new"), // missed a match
      outcome("new", "new"), // right: new
    ]);
    expect(scores.accuracy).toBeCloseTo(0.5);
    expect(scores.matchVsNewAccuracy).toBeCloseTo(0.75);
    expect(scores.correctProblemAccuracy).toBeCloseTo(1 / 3);
  });
});

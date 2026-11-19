import type { CaseAnswer, CaseScores } from "./types";

/**
 * Pure scoring for the Matcher eval: pairwise grouping scores for the replay,
 * and accuracy scores for the fixed-state cases.
 */

export type GroupingScores = { precision: number; recall: number; f1: number };

/**
 * Pairwise precision, recall and F1 of a grouping. Every pair of Requests is
 * either put on the same Problem (predicted) or shares a seed group (expected).
 * With no predicted pairs precision is vacuously 1; with no expected pairs recall is 1.
 */
export function pairwiseScores(
  items: { predicted: number; expected: string }[],
): GroupingScores {
  let truePositive = 0;
  let predictedPairs = 0;
  let expectedPairs = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const predicted = items[i].predicted === items[j].predicted;
      const expected = items[i].expected === items[j].expected;
      if (predicted) predictedPairs++;
      if (expected) expectedPairs++;
      if (predicted && expected) truePositive++;
    }
  }
  const precision = predictedPairs === 0 ? 1 : truePositive / predictedPairs;
  const recall = expectedPairs === 0 ? 1 : truePositive / expectedPairs;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

const share = (count: number, total: number) => (total === 0 ? 1 : count / total);

/** Accuracy scores over fixed-state case outcomes. */
export function caseScores(outcomes: { expected: CaseAnswer; answer: CaseAnswer }[]): CaseScores {
  const expectMatch = outcomes.filter((o) => o.expected !== "new");
  return {
    accuracy: share(outcomes.filter((o) => o.answer === o.expected).length, outcomes.length),
    matchVsNewAccuracy: share(
      outcomes.filter((o) => (o.answer === "new") === (o.expected === "new")).length,
      outcomes.length,
    ),
    correctProblemAccuracy: share(
      expectMatch.filter((o) => o.answer === o.expected).length,
      expectMatch.length,
    ),
  };
}

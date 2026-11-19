import type { CaseOutcome, EvalResult } from "./types";

/** Test helper: a case outcome, passed when the answer is the expected one. */
export function outcome(
  id: string,
  expected: CaseOutcome["expected"],
  answer: CaseOutcome["answer"],
  extra: Partial<CaseOutcome> = {},
): CaseOutcome {
  return { id, kind: "golden", must: false, expected, answer, passed: answer === expected, reason: "r", ...extra };
}

/** Test helper: an eval result with sensible defaults. */
export function result(overrides: Partial<EvalResult> = {}): EvalResult {
  return {
    commit: "abc1234",
    date: "2026-11-18T00:00:00.000Z",
    model: "claude-sonnet-5-5",
    replay: { precision: 0.9, recall: 0.8, f1: 0.85, problemsCreated: 17, expectedProblems: 16, assignments: [] },
    caseScores: { accuracy: 1, matchVsNewAccuracy: 1, correctProblemAccuracy: 1 },
    cases: [outcome("g1", 1, 1)],
    calls: 39,
    costUsd: 0.2,
    ...overrides,
  };
}

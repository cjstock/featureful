import type { Evaluation } from "@/lib/evaluator";
import type { CaseOutcome, EvalResult, InjectionOutcome } from "./types";

/** Test helper: an Evaluation with these Impact and Strategic fit scores (Effort and Risk 2). */
export function evaluation(impact: number, strategicFit: number): Evaluation {
  return {
    impact: { score: impact, reason: "i" },
    strategicFit: { score: strategicFit, reason: "s" },
    effort: { score: 2, reason: "e" },
    risk: { score: 2, reason: "r" },
  };
}

/** Test helper: an injection check outcome, the injected copy scoring 1/1 higher (passed) or 3/1 higher (failed). */
export function injectionCheck(passed: boolean): InjectionOutcome {
  return {
    clean: { impact: 2, strategicFit: 1 },
    injected: passed ? { impact: 3, strategicFit: 2 } : { impact: 5, strategicFit: 2 },
    passed,
  };
}

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
    injection: { ...injectionCheck(true), calls: 2, costUsd: 0.01 },
    calls: 41,
    costUsd: 0.2,
    ...overrides,
  };
}

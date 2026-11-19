import type { ProblemSummary, RequestDraft } from "@/lib/intake";

/** A Matcher's answer to a fixed-state case: the id of the matched Problem, or "new". */
export type CaseAnswer = number | "new";

export type CaseKind = "golden" | "boundary" | "adversarial" | "regression";

/** A fixed-state case: the Problems the Matcher is shown, one new Request, and the right answer. */
export type MatcherCase = {
  id: string;
  kind: CaseKind;
  /** A `must` case failing blocks the gate whatever the baseline says. */
  must: boolean;
  /** Where the case came from (hand-written, a Match review, ...). */
  source: string;
  problems: ProblemSummary[];
  request: RequestDraft;
  expected: CaseAnswer;
};

export type CaseOutcome = {
  id: string;
  kind: CaseKind;
  must: boolean;
  expected: CaseAnswer;
  answer: CaseAnswer;
  passed: boolean;
  /** The Matcher's reason; for a new-Problem answer, also the new Problem title it proposed. */
  reason: string;
};

export type CaseScores = {
  /** Share of cases answered exactly right. */
  accuracy: number;
  /** Share of cases where the Matcher got match-vs-new right. */
  matchVsNewAccuracy: number;
  /** Of the cases that expect a match, the share matched to the right Problem. */
  correctProblemAccuracy: number;
};

export type ReplayOutcome = {
  precision: number;
  recall: number;
  f1: number;
  problemsCreated: number;
  expectedProblems: number;
  /** Where each seed Request landed, in replay order. */
  assignments: { key: string; group: string; problemId: number }[];
};

/** One eval run. `evals/baseline.json` is one of these. */
export type EvalResult = {
  commit: string;
  date: string;
  model: string;
  replay: ReplayOutcome;
  caseScores: CaseScores;
  cases: CaseOutcome[];
  calls: number;
  costUsd: number;
};

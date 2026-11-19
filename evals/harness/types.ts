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

/** The Impact and Strategic fit scores the Evaluator gave one copy of the injection pair. */
export type InjectionScores = { impact: number; strategicFit: number };

/** The Evaluator injection check: the clean copy's scores against the injected copy's. */
export type InjectionOutcome = { clean: InjectionScores; injected: InjectionScores; passed: boolean };

/** One eval run. `evals/baseline.json` is one of these. */
export type EvalResult = {
  commit: string;
  date: string;
  model: string;
  replay: ReplayOutcome;
  caseScores: CaseScores;
  cases: CaseOutcome[];
  /**
   * The Evaluator injection check, with the AI calls and cost it took (already included in
   * `calls` and `costUsd`). Absent from results recorded before the check existed (the v1 baseline).
   */
  injection?: InjectionOutcome & { calls: number; costUsd: number };
  calls: number;
  costUsd: number;
};

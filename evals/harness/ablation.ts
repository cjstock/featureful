import { formatAnswer } from "./format";
import type { CaseOutcome } from "./types";

/**
 * The Boundary-notes ablation (build ticket 06): the same fixed state judged in
 * three arms, each run twice. (a) vs (b) shows whether Matching examples matter;
 * (b) vs (c) is the keep-or-cut test for Boundary notes.
 */
export type AblationArm = "a" | "b" | "c";

export const ARMS: Record<AblationArm, { label: string; examples: boolean; notes: boolean }> = {
  a: { label: "(a) neither", examples: false, notes: false },
  b: { label: "(b) Matching examples only", examples: true, notes: false },
  c: { label: "(c) examples + Boundary notes", examples: true, notes: true },
};

/** The keep rule: (c) must beat (b) by at least this many boundary cases on every run. */
export const KEEP_MARGIN = 2;
/** How many runs of each arm the rule needs. */
export const ABLATION_RUNS = 2;

/** One arm's pass over the cases: what it answered and what its calls cost. */
export type ArmRun = { arm: AblationArm; run: number; cases: CaseOutcome[]; calls: number; costUsd: number };

export type AblationRuns = { runs: ArmRun[] };

export type RunSummary = {
  run: number;
  /** Boundary cases answered right, per arm. */
  wins: Record<AblationArm, number>;
  /** (c) wins minus (b) wins. */
  margin: number;
  /** Golden cases passing in (b) and failing in (c). */
  goldenRegressions: string[];
};

/** Boundary cases the Matcher answered right in one arm's run. */
export function boundaryWins(cases: CaseOutcome[]): number {
  return cases.filter((c) => c.kind === "boundary" && c.passed).length;
}

/**
 * Golden cases that pass in the examples-only arm but fail once Boundary notes
 * are added (both arms from the same run). Any one vetoes keeping the notes.
 */
export function goldenRegressions(examplesOnly: CaseOutcome[], withNotes: CaseOutcome[]): string[] {
  const passedBefore = new Set(examplesOnly.filter((c) => c.kind === "golden" && c.passed).map((c) => c.id));
  return withNotes.filter((c) => c.kind === "golden" && !c.passed && passedBefore.has(c.id)).map((c) => c.id);
}

/** Per run: boundary wins per arm, the (c) − (b) margin and golden regressions. Runs missing an arm are left out. */
export function summarizeAblation({ runs }: AblationRuns): RunSummary[] {
  const numbers = [...new Set(runs.map((r) => r.run))].sort((x, y) => x - y);
  return numbers.flatMap((run) => {
    const arm = (id: AblationArm) => runs.find((r) => r.run === run && r.arm === id);
    const [a, b, c] = [arm("a"), arm("b"), arm("c")];
    if (!a || !b || !c) return [];
    const wins = { a: boundaryWins(a.cases), b: boundaryWins(b.cases), c: boundaryWins(c.cases) };
    return [{ run, wins, margin: wins.c - wins.b, goldenRegressions: goldenRegressions(b.cases, c.cases) }];
  });
}

/**
 * The keep-or-cut rule (ticket 06, answer 3): keep Boundary notes only if (c)
 * beats (b) by at least 2 boundary cases on both runs, with no golden case
 * regressing on either run. Anything else, including a missing run, cuts them.
 */
export function decideBoundaryNotes(result: AblationRuns): "keep" | "cut" {
  const summaries = summarizeAblation(result);
  const keep =
    summaries.length >= ABLATION_RUNS &&
    summaries.every((s) => s.margin >= KEEP_MARGIN && s.goldenRegressions.length === 0);
  return keep ? "keep" : "cut";
}

const ARM_IDS: AblationArm[] = ["a", "b", "c"];

/** Each arm's spend over all its runs, divided by the Requests it judged (0 for an arm that didn't run). */
export function costPerRequest({ runs }: AblationRuns): Record<AblationArm, number> {
  const per = (arm: AblationArm) => {
    const mine = runs.filter((r) => r.arm === arm);
    const requests = mine.reduce((n, r) => n + r.cases.length, 0);
    return requests === 0 ? 0 : mine.reduce((sum, r) => sum + r.costUsd, 0) / requests;
  };
  return { a: per("a"), b: per("b"), c: per("c") };
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** The ablation report as Markdown: the per-run table, cost per Request, per-case answers and the decision. */
export function formatAblationReport(result: AblationRuns & { boundaryCases: number; goldenCases: number }): string {
  const summaries = summarizeAblation(result);
  const decision = decideBoundaryNotes(result);
  const lines = [
    "## Boundary-notes ablation",
    "",
    `${result.boundaryCases} boundary cases in every arm; ${result.goldenCases} golden cases in (b) and (c).`,
    "",
    "| Run | (a) neither | (b) examples only | (c) examples + notes | (c) − (b) | Golden regressions (c vs b) |",
    "| --- | --- | --- | --- | --- | --- |",
    ...summaries.map(
      (s) =>
        `| Run ${s.run} | ${s.wins.a} | ${s.wins.b} | ${s.wins.c} | ${signed(s.margin)} | ${s.goldenRegressions.join(", ") || "none"} |`,
    ),
    "",
    "Cells are boundary cases answered right.",
    "",
  ];

  const cost = costPerRequest(result);
  lines.push("| Arm | Cost per Request |", "| --- | --- |");
  for (const arm of ARM_IDS) lines.push(`| ${ARMS[arm].label} | $${cost[arm].toFixed(5)} |`);
  lines.push("");

  const all = result.runs.flatMap((r) => r.cases);
  const ids = [...new Set(all.map((c) => c.id))];
  lines.push(
    `| Case | Expected | ${result.runs.map((r) => `${r.arm}${r.run}`).join(" | ")} |`,
    `| --- | --- | ${result.runs.map(() => "---").join(" | ")} |`,
  );
  for (const id of ids) {
    const expected = all.find((c) => c.id === id)!.expected;
    const cells = result.runs.map((run) => {
      const c = run.cases.find((x) => x.id === id);
      return !c ? "—" : c.passed ? "pass" : `fail (${formatAnswer(c.answer)})`;
    });
    lines.push(`| ${id} | ${formatAnswer(expected)} | ${cells.join(" | ")} |`);
  }
  lines.push(
    "",
    `Rule: keep only if (c) beats (b) by ≥${KEEP_MARGIN} boundary cases on both runs, with no golden case regressing (passing in (b), failing in (c)) on either run.`,
    "",
    `Decision by rule: **${decision.toUpperCase()}**`,
  );
  return lines.join("\n");
}

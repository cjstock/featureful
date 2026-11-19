import type { Matcher } from "@/lib/intake";
import type { BoundaryNoteWriter } from "@/lib/match-review";
import { armCases, armState, type SimulatedReview, writerInputs } from "../matcher/ablation/cases";
import { ABLATION_RUNS, type AblationArm, type ArmRun } from "./ablation";
import { runCase } from "./run";
import type { CaseOutcome } from "./types";

/**
 * Write Boundary notes from the simulated reviews, oldest first, the way
 * background distillation would: each review revises its source and destination
 * Problems' notes, one writer call each, starting from the note so far. An empty
 * answer leaves the note as it was. Returns the final note per Problem id.
 */
export async function distilAblationNotes(
  reviews: SimulatedReview[],
  writer: BoundaryNoteWriter,
): Promise<Record<number, string>> {
  const notes: Record<number, string> = {};
  for (const review of reviews) {
    for (const input of writerInputs(review)) {
      const revised = (await writer({ ...input, currentNote: notes[input.problem.id] ?? null })).trim();
      if (revised) notes[input.problem.id] = revised;
    }
  }
  return notes;
}

const ARM_ORDER: AblationArm[] = ["a", "b", "c"];

/**
 * Run every arm over its cases, `ABLATION_RUNS` times (run 1: a, b, c; then
 * run 2), sequentially. `totals` reads the meter, so each arm's calls and cost
 * are what it added.
 */
export async function runAblation(
  matcher: Matcher,
  notes: Record<number, string>,
  totals: () => { calls: number; costUsd: number },
): Promise<ArmRun[]> {
  const runs: ArmRun[] = [];
  for (let run = 1; run <= ABLATION_RUNS; run++) {
    for (const arm of ARM_ORDER) {
      const { problems, examples } = armState(arm, notes);
      const before = totals();
      const cases: CaseOutcome[] = [];
      for (const c of armCases(arm)) cases.push(await runCase(matcher, { ...c, problems }, examples));
      const after = totals();
      runs.push({ arm, run, cases, calls: after.calls - before.calls, costUsd: after.costUsd - before.costUsd });
    }
  }
  return runs;
}

import { createDb, type Db } from "@/db";
import { people } from "@/db/schema";
import { createIntake, type Matcher } from "@/lib/intake";
import { SEED_PEOPLE, SEED_REQUESTS } from "../../scripts/seed-data";
import { caseScores, pairwiseScores } from "./score";
import type { CaseOutcome, EvalResult, MatcherCase, ReplayOutcome } from "./types";

export type EvalRun = Pick<EvalResult, "replay" | "caseScores" | "cases">;

/**
 * Replay the seed Requests through intake into `db` (empty, in memory), in
 * the seed's order, with the submitter always accepting the Matcher's proposal.
 * Nothing else runs: no Evaluator, no writers, so the only AI calls are the
 * Matcher's (one per seed Request).
 */
async function replay(matcher: Matcher, db: Db): Promise<ReplayOutcome> {
  db.insert(people).values(SEED_PEOPLE).run();
  const personId = new Map(db.select().from(people).all().map((p) => [p.name, p.id]));
  const intake = createIntake({ db, matcher });

  const ordered = [...SEED_REQUESTS].sort((a, b) => b.daysAgo - a.daysAgo);
  const assignments: ReplayOutcome["assignments"] = [];
  for (const seed of ordered) {
    const draft = { title: seed.title, description: seed.description };
    const proposal = await intake.propose(draft);
    const decision = proposal.match ? { attachTo: proposal.match.problemId } : { createProblem: proposal.newProblem };
    const { problemId } = intake.confirm(draft, proposal, decision, personId.get(seed.author)!);
    assignments.push({ key: seed.key, group: seed.group, problemId });
  }

  return {
    ...pairwiseScores(assignments.map((a) => ({ predicted: a.problemId, expected: a.group }))),
    problemsCreated: new Set(assignments.map((a) => a.problemId)).size,
    expectedProblems: new Set(SEED_REQUESTS.map((r) => r.group)).size,
    assignments,
  };
}

/** Ask the Matcher about one fixed-state case. A match to a Problem it wasn't shown counts as wrong. */
async function runCase(matcher: Matcher, c: MatcherCase): Promise<CaseOutcome> {
  const result = await matcher(c.request, c.problems, []);
  const answer = result.match ? result.match.problemId : "new";
  return {
    id: c.id,
    kind: c.kind,
    must: c.must,
    expected: c.expected,
    answer,
    passed: answer === c.expected,
    reason: result.match
      ? result.match.reason
      : [result.reason, `(New Problem: ${result.newProblem.title})`].filter(Boolean).join(" "),
  };
}

/**
 * Run the replay and every fixed-state case, sequentially, and score them. `db` is the run's own
 * empty in-memory database: the replay writes to it, and so do the Matcher's AI call records when
 * the Matcher was created on it. Never the app's database.
 */
export async function runEval(matcher: Matcher, cases: MatcherCase[], db: Db = createDb(":memory:")): Promise<EvalRun> {
  const replayOutcome = await replay(matcher, db);
  const outcomes: CaseOutcome[] = [];
  for (const c of cases) outcomes.push(await runCase(matcher, c));
  return { replay: replayOutcome, caseScores: caseScores(outcomes), cases: outcomes };
}

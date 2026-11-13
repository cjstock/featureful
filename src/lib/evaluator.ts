import { asc, eq } from "drizzle-orm";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { Db } from "@/db";
import { problems, requests } from "@/db/schema";
import { model } from "@/lib/ai";
import { getProductStrategy } from "@/lib/product-strategy";

/**
 * Evaluator (AI): scores a Problem's Impact, Strategic fit, Effort and delivery Risk 1–5,
 * each with a one-line reason, from the Problem, its Evidence and the Product Strategy.
 * Demand is not judged here; it is computed live from the supporter count.
 */

const SYSTEM = `You evaluate customer Problems for the product team of a coffee-tracking app (beans, roasts, brews, recipes).

A Problem is an underlying customer need; its Evidence is the raw Requests customers wrote about it.
Score each criterion as an integer from 1 to 5 and give a one-line reason (max ~20 words) a PM can check against the Evidence.

- impact: how painful and how frequent the Problem is for the people who have it. 1 = minor annoyance, rarely hit; 5 = blocks a core workflow, hit constantly. Judge pain and frequency from the Evidence, NOT how many people asked (Demand is scored separately). The cost of leaving the Problem unsolved belongs here.
- strategicFit: how well solving the Problem advances the Product Strategy below. 1 = unrelated or against it (e.g. a stated non-goal); 5 = directly advances a stated goal. Name the goal in the reason.
- effort: the estimated cost of solving the Problem with a reasonable solution. 1 = small change, days; 5 = large project, many weeks or new infrastructure.
- risk: DELIVERY risk only: the likelihood that solving the Problem goes wrong (technical unknowns, data migration or breakage, external dependencies such as hardware, third-party APIs or vendors). 1 = well-understood, self-contained; 5 = major unknowns or dependencies. This is NOT the risk of leaving the Problem unsolved.

Be calibrated: use the whole scale and do not default to 3.`;

const criterion = z.object({
  score: z.number().int().min(1).max(5),
  reason: z.string().describe("One line, max ~20 words"),
});

const evaluationSchema = z.object({
  impact: criterion,
  strategicFit: criterion,
  effort: criterion,
  risk: criterion,
});

export type Evaluation = z.infer<typeof evaluationSchema>;

export interface EvaluatorInput {
  problem: { title: string; need: string };
  evidence: { title: string; description: string }[];
  productStrategy: string;
}

/** Most Evidence shown to the model; keeps the prompt bounded on popular Problems. */
const MAX_EVIDENCE = 40;

/** One structured-output LLM call. Writes nothing. */
export async function runEvaluator({ problem, evidence, productStrategy }: EvaluatorInput) {
  const shown = evidence.slice(0, MAX_EVIDENCE);
  const evidenceText =
    shown.length === 0
      ? "(no Evidence yet)"
      : shown.map((r, i) => `${i + 1}. ${r.title}\n   ${r.description.replace(/\s+/g, " ")}`).join("\n");

  const { output } = await generateText({
    model,
    system: SYSTEM,
    prompt: `Product Strategy:\n${productStrategy}\n\nProblem: ${problem.title}\nNeed: ${problem.need}\n\nEvidence (${evidence.length} Requests${evidence.length > shown.length ? `, first ${shown.length} shown` : ""}):\n${evidenceText}`,
    output: Output.object({ schema: evaluationSchema }),
  });
  return output;
}

/**
 * Evaluate one Problem and store its scores, reasons and evaluated_at.
 * Throws if the Problem doesn't exist or the AI call fails; previous scores are left untouched then.
 * Reusable outside Next (seed script): pass any Db.
 */
export async function evaluateProblem(db: Db, problemId: number): Promise<Evaluation> {
  const problem = db.select().from(problems).where(eq(problems.id, problemId)).get();
  if (!problem) throw new Error(`Problem ${problemId} not found`);
  const evidence = db
    .select({ title: requests.title, description: requests.description })
    .from(requests)
    .where(eq(requests.problemId, problemId))
    .orderBy(asc(requests.createdAt), asc(requests.id))
    .all();

  const evaluation = await runEvaluator({
    problem,
    evidence,
    productStrategy: getProductStrategy(db).body,
  });

  db.update(problems)
    .set({
      impactScore: evaluation.impact.score,
      impactReason: evaluation.impact.reason,
      strategicFitScore: evaluation.strategicFit.score,
      strategicFitReason: evaluation.strategicFit.reason,
      effortScore: evaluation.effort.score,
      effortReason: evaluation.effort.reason,
      riskScore: evaluation.risk.score,
      riskReason: evaluation.risk.reason,
      evaluatedAt: new Date(),
    })
    .where(eq(problems.id, problemId))
    .run();
  return evaluation;
}

/** Evaluate without throwing (for background runs); logs and returns false on failure. */
export async function tryEvaluateProblem(db: Db, problemId: number): Promise<boolean> {
  try {
    await evaluateProblem(db, problemId);
    return true;
  } catch (error) {
    console.error(`Evaluation of Problem ${problemId} failed`, error);
    return false;
  }
}

/** Re-evaluate every Problem, a few at a time. Failures are logged and counted, not thrown. */
export async function evaluateAllProblems(db: Db, concurrency = 4) {
  const ids = db.select({ id: problems.id }).from(problems).orderBy(asc(problems.id)).all().map((p) => p.id);
  let next = 0;
  let failed = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      if (!(await tryEvaluateProblem(db, id))) failed++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return { total: ids.length, failed };
}

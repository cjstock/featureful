import { eq, max, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { aiCalls, problems, requests, type AiCallOutcome } from "@/db/schema";
import { evaluatorCallsAbout, newestAiCallFirst } from "@/lib/ai-calls";
import type { AiUnavailableReason } from "@/lib/ai-controls";
import { formatUtcTime } from "@/lib/utc-time";

/** Whether a Problem's evaluation still reflects it (see "Freshness" in the v2 spec). */
export interface EvaluationFreshness {
  /** Evidence arrived after the last evaluation (`evaluatedAt`). Never true for an unevaluated Problem. */
  stale: boolean;
  /** When the latest Evaluator AI call for this Problem didn't return ok; null if it did, or never ran. */
  failedAt: Date | null;
  /**
   * When that latest call was refused rather than failed: over the daily budget, or the Evaluator
   * switched off. Shown as "Not evaluated (budget reached / Evaluator off)".
   */
  refusal: AiUnavailableReason | null;
}

const FRESH: EvaluationFreshness = { stale: false, failedAt: null, refusal: null };

const REFUSALS: Partial<Record<AiCallOutcome, AiUnavailableReason>> = { refused_budget: "budget", refused_off: "off" };

/** Neither stale nor failed: nothing to show. */
export function isFresh({ stale, failedAt }: EvaluationFreshness): boolean {
  return !stale && !failedAt;
}

/** Freshness of one Problem. */
export function evaluationFreshness(db: Db, problemId: number): EvaluationFreshness {
  return freshnessByProblemId(db, problemId).get(problemId) ?? FRESH;
}

/** Freshness of every Problem, keyed by Problem id, in two queries (for the Problems list). */
export function listEvaluationFreshness(db: Db): Map<number, EvaluationFreshness> {
  return freshnessByProblemId(db);
}

/** Freshness keyed by Problem id, for one Problem or (when `problemId` is omitted) all of them. */
function freshnessByProblemId(db: Db, problemId?: number): Map<number, EvaluationFreshness> {
  // Stale: the newest Evidence is strictly newer than the evaluation.
  const evaluations = db
    .select({ id: problems.id, evaluatedAt: problems.evaluatedAt, newestEvidence: max(requests.createdAt) })
    .from(problems)
    .leftJoin(requests, eq(requests.problemId, problems.id))
    .where(problemId === undefined ? undefined : eq(problems.id, problemId))
    .groupBy(problems.id)
    .all();

  // Failed: each Problem's latest Evaluator AI call didn't return ok.
  const ranked = db.$with("ranked").as(
    db
      .select({
        problemId: aiCalls.relatedId,
        time: aiCalls.time,
        outcome: aiCalls.outcome,
        rank: sql<number>`row_number() over (partition by ${aiCalls.relatedId} order by ${sql.join(newestAiCallFirst, sql`, `)})`.as(
          "rank",
        ),
      })
      .from(aiCalls)
      .where(evaluatorCallsAbout(problemId)),
  );
  const latestCalls = db.with(ranked).select().from(ranked).where(eq(ranked.rank, 1)).all();
  const failed = new Map(
    latestCalls.flatMap((c) => (c.problemId !== null && c.outcome !== "ok" ? [[c.problemId, c] as const] : [])),
  );

  return new Map(
    evaluations.map(({ id, evaluatedAt, newestEvidence }) => [
      id,
      {
        stale: Boolean(evaluatedAt && newestEvidence && new Date(newestEvidence) > evaluatedAt),
        failedAt: failed.get(id)?.time ?? null,
        refusal: REFUSALS[failed.get(id)?.outcome ?? "ok"] ?? null,
      },
    ]),
  );
}

export const STALE_LABEL = "Stale: new Evidence since the last evaluation";

/** "Evaluation failed at 21:05 UTC". */
export function failedAtLabel(failedAt: Date): string {
  return `Evaluation failed at ${formatUtcTime(failedAt)} UTC`;
}

const NOT_EVALUATED: Record<AiUnavailableReason, string> = {
  budget: "Not evaluated (budget reached)",
  off: "Not evaluated (Evaluator off)",
};

/** "Not evaluated (budget reached)" or "Not evaluated (Evaluator off)". */
export function notEvaluatedLabel(refusal: AiUnavailableReason): string {
  return NOT_EVALUATED[refusal];
}

import { eq, max, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { aiCalls, problems, requests } from "@/db/schema";
import { evaluatorCallsAbout, newestAiCallFirst } from "@/lib/ai-calls";

/** Whether a Problem's evaluation still reflects it (see "Freshness" in the v2 spec). */
export interface EvaluationFreshness {
  /** Evidence arrived after the last evaluation (`evaluatedAt`). Never true for an unevaluated Problem. */
  stale: boolean;
  /** When the latest Evaluator AI call for this Problem didn't return ok; null if it did, or never ran. */
  failedAt: Date | null;
}

const FRESH: EvaluationFreshness = { stale: false, failedAt: null };

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
  const failedAt = new Map(
    latestCalls.flatMap((c) => (c.problemId !== null && c.outcome !== "ok" ? [[c.problemId, c.time] as const] : [])),
  );

  return new Map(
    evaluations.map(({ id, evaluatedAt, newestEvidence }) => [
      id,
      {
        stale: Boolean(evaluatedAt && newestEvidence && new Date(newestEvidence) > evaluatedAt),
        failedAt: failedAt.get(id) ?? null,
      },
    ]),
  );
}

export const STALE_LABEL = "Stale: new Evidence since the last evaluation";

const utcTime = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** "Evaluation failed at 21:05 UTC". */
export function failedAtLabel(failedAt: Date): string {
  return `Evaluation failed at ${utcTime.format(failedAt)} UTC`;
}

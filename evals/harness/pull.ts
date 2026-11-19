import { and, asc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { aiCalls, matchingDecisions, requests } from "@/db/schema";
import type { MatcherCase } from "./types";

/**
 * `npm run eval:pull`: turn the Matching decisions a PM marked as Regression cases into
 * fixed-state Matcher cases (evals/matcher/regression.json format). Each case shows the Matcher
 * exactly the Problems its AI call was shown, and expects where the PM put the Request: that
 * Problem's id if it was among them, otherwise "new".
 */

/** The Problems an AI call was shown. Extra keys (a pre-cut call's `boundaryNote`) are dropped. */
const shownProblemsSchema = z.array(z.object({ id: z.number().int(), title: z.string(), need: z.string() }));

export type PullResult = {
  cases: MatcherCase[];
  /** Marked decisions that couldn't be exported, and why. */
  skipped: { decisionId: number; why: string }[];
};

export function pullRegressionCases(db: Db): PullResult {
  const rows = db
    .select({
      id: matchingDecisions.id,
      verdict: matchingDecisions.verdict,
      toProblemId: matchingDecisions.toProblemId,
      request: { title: requests.title, description: requests.description, problemId: requests.problemId },
      shownProblems: aiCalls.shownProblems,
    })
    .from(matchingDecisions)
    .innerJoin(requests, eq(requests.id, matchingDecisions.requestId))
    .leftJoin(aiCalls, eq(aiCalls.id, matchingDecisions.aiCallId))
    .where(and(eq(matchingDecisions.regressionCase, true), isNotNull(matchingDecisions.verdict)))
    .orderBy(asc(matchingDecisions.id))
    .all();

  const result: PullResult = { cases: [], skipped: [] };
  for (const row of rows) {
    const shown = shownProblemsSchema.safeParse(row.shownProblems);
    if (row.shownProblems == null || !shown.success) {
      result.skipped.push({ decisionId: row.id, why: "no AI call record with the Problems shown" });
      continue;
    }
    // Where the PM put the Request: a Move or Split's destination, or (Confirm) where it is.
    const placed = row.verdict === "confirm" ? row.request.problemId : row.toProblemId;
    if (placed === null) {
      result.skipped.push({ decisionId: row.id, why: "the Problem the PM chose has since been deleted" });
      continue;
    }
    result.cases.push({
      id: `regression-decision-${row.id}`,
      kind: "regression",
      must: false,
      source: `Matching decision #${row.id}`,
      problems: shown.data,
      request: { title: row.request.title, description: row.request.description },
      expected: shown.data.some((p) => p.id === placed) ? placed : "new",
    });
  }
  return result;
}

export type MergeResult = {
  cases: MatcherCase[];
  added: string[];
  /** Pulled again with different content, and replaced (only with `force`). */
  replaced: string[];
  /** Pulled again with different content, and kept as they were (without `force`). */
  conflicts: string[];
};

/**
 * Existing cases, in their order, then the newly pulled ones appended. A pulled case whose id is
 * already there and whose content is the same changes nothing; one whose content differs (say the
 * decision was edited since) is kept as it was and reported, unless `force` replaces it in place.
 */
export function mergeRegressionCases(
  existing: MatcherCase[],
  pulled: MatcherCase[],
  { force = false }: { force?: boolean } = {},
): MergeResult {
  const result: MergeResult = { cases: [...existing], added: [], replaced: [], conflicts: [] };
  for (const c of pulled) {
    const at = result.cases.findIndex((e) => e.id === c.id);
    if (at === -1) {
      result.cases.push(c);
      result.added.push(c.id);
    } else if (JSON.stringify(result.cases[at]) !== JSON.stringify(c)) {
      if (force) {
        result.cases[at] = c;
        result.replaced.push(c.id);
      } else {
        result.conflicts.push(c.id);
      }
    }
  }
  return result;
}

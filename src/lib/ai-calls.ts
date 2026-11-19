import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { aiCalls, type AiCall, type AiModule, type Person } from "@/db/schema";
import { isPm } from "@/lib/roles";

/** Reading AI call records back: the AI call line PMs see, and the stored content (PM-only). */

export const AI_MODULE_LABELS: Record<AiModule, string> = {
  matcher: "Matcher",
  evaluator: "Evaluator",
  boundary_note: "Boundary note writer",
  decision_note: "Decision note drafter",
  brief: "Brief writer",
};

/** What the AI call line shows: no content. */
export type AiCallSummary = Pick<AiCall, "module" | "promptVersion" | "costUsd" | "latencyMs" | "outcome">;
export type AiCallLine = AiCallSummary & { id: number };

/** The columns of an `AiCallLine`, for selects that show one. */
export const summaryColumns = {
  id: aiCalls.id,
  module: aiCalls.module,
  promptVersion: aiCalls.promptVersion,
  costUsd: aiCalls.costUsd,
  latencyMs: aiCalls.latencyMs,
  outcome: aiCalls.outcome,
};

/** "Matcher · v3f9a · $0.004 · 1.2s", plus the outcome when it wasn't ok. */
export function formatAiCallLine({ module, promptVersion, costUsd, latencyMs, outcome }: AiCallSummary): string {
  return [
    AI_MODULE_LABELS[module],
    `v${promptVersion.slice(0, 4)}`,
    `$${costUsd.toFixed(3)}`,
    `${(latencyMs / 1000).toFixed(1)}s`,
    ...(outcome === "ok" ? [] : [outcome]),
  ].join(" · ");
}

/** The newest successful Evaluator AI call for a Problem: the one behind its current scores. */
export function latestEvaluationCall(db: Db, problemId: number): AiCallLine | null {
  return (
    db
      .select(summaryColumns)
      .from(aiCalls)
      .where(
        and(
          eq(aiCalls.module, "evaluator"),
          eq(aiCalls.outcome, "ok"),
          eq(aiCalls.relatedType, "problem"),
          eq(aiCalls.relatedId, problemId),
        ),
      )
      .orderBy(desc(aiCalls.time), desc(aiCalls.id))
      .get() ?? null
  );
}

export type AiCallContent = AiCallLine &
  Pick<AiCall, "model" | "time" | "source" | "system" | "prompt" | "output" | "error" | "shownProblems">;

/**
 * An AI call's stored prompt and output, for `viewer`. PM-only: anyone else is rejected here, on
 * the server, whatever the UI shows. Null if there is no such AI call.
 */
export function getAiCallContent(db: Db, viewer: Pick<Person, "role">, id: number): AiCallContent | null {
  if (!isPm(viewer)) throw new Error("Only pm can view AI call content");
  return (
    db
      .select({
        ...summaryColumns,
        model: aiCalls.model,
        time: aiCalls.time,
        source: aiCalls.source,
        system: aiCalls.system,
        prompt: aiCalls.prompt,
        output: aiCalls.output,
        error: aiCalls.error,
        shownProblems: aiCalls.shownProblems,
      })
      .from(aiCalls)
      .where(eq(aiCalls.id, id))
      .get() ?? null
  );
}

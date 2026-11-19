import { and, desc, eq, gte, lt, min, sum } from "drizzle-orm";
import type { Db } from "@/db";
import {
  aiCalls,
  aiModuleFlips,
  aiModuleSettings,
  CALLABLE_AI_MODULES,
  people,
  type CallableAiModule,
} from "@/db/schema";
import { AI_MAX_OUTPUT_TOKENS, aiDailyBudgetUsd, CLAUDE_MODEL, MODEL_PRICES } from "@/lib/config";

/**
 * AI controls: the daily app budget and the per-module off switch, read by `aiGenerate` before
 * every app AI call and shown to PMs (AI controls on `/strategy`, the budget banner on `/review`,
 * disabled writer buttons).
 */

/** Why a module can't make an app AI call right now. */
export type Unavailable = "off" | "budget";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 00:00 UTC on `now`'s UTC day: when today's budget started. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
}

/** AI calls made on `now`'s UTC day. */
function onUtcDayOf(now: Date) {
  const start = startOfUtcDay(now);
  return and(gte(aiCalls.time, start), lt(aiCalls.time, new Date(start.getTime() + DAY_MS)));
}

/** Whether a module's off switch is on. A module with no settings row is on. */
export function isModuleOn(db: Db, module: CallableAiModule): boolean {
  return (
    db.select({ on: aiModuleSettings.on }).from(aiModuleSettings).where(eq(aiModuleSettings.module, module)).get()?.on ??
    true
  );
}

/** Flip a module's off switch and record who did it and when. Callers check the PM role. */
export function setModuleOn(db: Db, module: CallableAiModule, on: boolean, personId: number, at = new Date()): void {
  db.transaction((tx) => {
    tx.insert(aiModuleSettings)
      .values({ module, on })
      .onConflictDoUpdate({ target: aiModuleSettings.module, set: { on } })
      .run();
    tx.insert(aiModuleFlips).values({ module, on, personId, at }).run();
  });
}

export type AiControl = {
  module: CallableAiModule;
  on: boolean;
  /** The last flip of this switch; null if it was never flipped (on by default). */
  lastFlip: { on: boolean; personName: string; at: Date } | null;
};

/** Every callable module's switch, with its last flip. */
export function listAiControls(db: Db): AiControl[] {
  return CALLABLE_AI_MODULES.map((module) => {
    const lastFlip =
      db
        .select({ on: aiModuleFlips.on, personName: people.name, at: aiModuleFlips.at })
        .from(aiModuleFlips)
        .innerJoin(people, eq(people.id, aiModuleFlips.personId))
        .where(eq(aiModuleFlips.module, module))
        .orderBy(desc(aiModuleFlips.at), desc(aiModuleFlips.id))
        .get() ?? null;
    return { module, on: isModuleOn(db, module), lastFlip };
  });
}

/** What `app` AI calls have cost on `now`'s UTC day. Refused calls cost nothing. */
export function appSpendToday(db: Db, now: Date): number {
  const row = db
    .select({ total: sum(aiCalls.costUsd) })
    .from(aiCalls)
    .where(and(eq(aiCalls.source, "app"), onUtcDayOf(now)))
    .get();
  return Number(row?.total ?? 0);
}

export type BudgetStatus = {
  budgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  /** The first app AI call refused for budget today; null if none was. */
  reachedAt: Date | null;
};

/** Today's (UTC) app budget, spend, what's left, and when it was first reached. */
export function budgetStatus(db: Db, now: Date): BudgetStatus {
  const budgetUsd = aiDailyBudgetUsd();
  const spentUsd = appSpendToday(db, now);
  const reached = db
    .select({ at: min(aiCalls.time) })
    .from(aiCalls)
    .where(and(eq(aiCalls.source, "app"), eq(aiCalls.outcome, "refused_budget"), onUtcDayOf(now)))
    .get()?.at;
  return {
    budgetUsd,
    spentUsd,
    remainingUsd: Math.max(0, budgetUsd - spentUsd),
    reachedAt: reached ? new Date(reached) : null,
  };
}

/**
 * Why `module` can't make an app AI call now, or null if it can: it's switched off, or the budget
 * is reached (a call was refused for budget today, or not even a full answer at the module's
 * output cap would fit). For disabling buttons before a click; `aiGenerate` still checks each call.
 */
export function moduleUnavailable(db: Db, module: CallableAiModule, now: Date): Unavailable | null {
  if (!isModuleOn(db, module)) return "off";
  let status: BudgetStatus;
  try {
    status = budgetStatus(db, now);
  } catch {
    return "budget"; // a misconfigured budget refuses every call
  }
  const fullAnswerUsd = (AI_MAX_OUTPUT_TOKENS[module] * MODEL_PRICES[CLAUDE_MODEL].output) / 1_000_000;
  if (status.reachedAt || fullAnswerUsd > status.remainingUsd) return "budget";
  return null;
}

const utcTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });

/** The `/review` banner: "AI budget reached at 14:05 UTC; resets 00:00 UTC". */
export function budgetReachedLabel(reachedAt: Date): string {
  return `AI budget reached at ${utcTime.format(reachedAt)} UTC; resets 00:00 UTC`;
}

/** Each callable module's name in copy ("The Evaluator is switched off"). */
export const AI_MODULE_NAMES: Record<CallableAiModule, string> = {
  matcher: "Matcher",
  evaluator: "Evaluator",
  decision_note: "Decision note drafter",
  brief: "Brief writer",
};

/** Why a button that makes an AI call is disabled. */
export function unavailableLabel(module: CallableAiModule, why: Unavailable): string {
  return why === "off"
    ? `The ${AI_MODULE_NAMES[module]} is switched off in AI controls.`
    : "AI budget reached; resets 00:00 UTC.";
}

/** For a button that makes an app AI call: why it's disabled now, or null if it isn't. */
export function disabledReason(db: Db, module: CallableAiModule, now = new Date()): string | null {
  const why = moduleUnavailable(db, module, now);
  return why && unavailableLabel(module, why);
}

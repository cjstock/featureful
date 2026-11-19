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
import { AI_MODULE_LABELS } from "@/lib/ai-calls";
import { AI_MAX_OUTPUT_TOKENS, aiDailyBudgetUsd, CLAUDE_MODEL, MODEL_PRICES } from "@/lib/config";
import { formatUtcTime } from "@/lib/utc-time";

/**
 * AI controls: the daily app budget and the per-module off switch, read by `aiGenerate` before
 * every app AI call and shown to PMs (AI controls on `/strategy`, the budget banner on `/review`,
 * disabled writer buttons).
 */

/**
 * Why an app AI call can't be made: the daily budget would be crossed, or the module is switched
 * off. Shared by refusals (`AiRefusal`), disabled buttons and "Not evaluated" copy.
 */
export type AiUnavailableReason = "budget" | "off";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 00:00 UTC on `now`'s UTC day: when today's budget started. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
}

/**
 * AI calls recorded on `now`'s UTC day. A call is recorded (and so booked) when it finishes, so a
 * call that spans 00:00 UTC counts against the day it finished.
 */
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
  /** The first app AI call refused for budget today; null if none was. For the `/review` banner. */
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
 * Why `module` can't make an app AI call now, or null if it can: it's switched off, or a full
 * answer at its own output cap no longer fits today's remaining budget (current spend against the
 * current `AI_DAILY_BUDGET_USD`, so raising the budget re-enables it at once). Per module: a
 * refused Brief doesn't disable a cheaper Decision note draft that still fits. The prompt isn't
 * known before a click, so `aiGenerate` still checks each call and may refuse one that this
 * allowed. Throws if the off switch can't be read.
 */
export function moduleUnavailable(db: Db, module: CallableAiModule, now: Date): AiUnavailableReason | null {
  if (!isModuleOn(db, module)) return "off";
  let remainingUsd: number;
  try {
    remainingUsd = budgetStatus(db, now).remainingUsd;
  } catch {
    return "budget"; // a misconfigured budget refuses every call
  }
  const fullAnswerUsd = (AI_MAX_OUTPUT_TOKENS[module] * MODEL_PRICES[CLAUDE_MODEL].output) / 1_000_000;
  return fullAnswerUsd > remainingUsd ? "budget" : null;
}

/** The `/review` banner: "AI budget reached at 14:05 UTC; resets 00:00 UTC". */
export function budgetReachedLabel(reachedAt: Date): string {
  return `AI budget reached at ${formatUtcTime(reachedAt)} UTC; resets 00:00 UTC`;
}

/** Why a button that makes an AI call is disabled. */
export function unavailableLabel(module: CallableAiModule, why: AiUnavailableReason): string {
  return why === "off"
    ? `The ${AI_MODULE_LABELS[module]} is switched off in AI controls.`
    : `AI budget reached for the ${AI_MODULE_LABELS[module]}; resets 00:00 UTC.`;
}

export const CONTROLS_UNAVAILABLE = "AI controls unavailable.";

/**
 * For a button that makes an app AI call: why it's disabled now, or null if it isn't. Fails
 * closed without breaking the page: if the controls can't be read, the button is disabled.
 */
export function disabledReason(db: Db, module: CallableAiModule, now = new Date()): string | null {
  let why: AiUnavailableReason | null;
  try {
    why = moduleUnavailable(db, module, now);
  } catch (error) {
    console.error(`Couldn't read the AI controls for the ${module} module`, error);
    return CONTROLS_UNAVAILABLE;
  }
  return why && unavailableLabel(module, why);
}

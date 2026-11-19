/**
 * The controls at the AI call seam: the daily app budget and the per-module off switch. Every
 * refused call is never sent, leaves an AI call record, and throws an `AiRefusal` that
 * `failedAiCall` identifies. Offline model only; no network calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { createDb, type Db } from "@/db";
import { aiCalls, aiModuleFlips, people, CALLABLE_AI_MODULES, type CallableAiModule } from "@/db/schema";
import { aiGenerate, AiRefusal, failedAiCall, offlineModel, type AiMeter, type AiModel } from "@/lib/ai";
import {
  budgetReachedLabel,
  budgetStatus,
  disabledReason,
  listAiControls,
  moduleUnavailable,
  setModuleOn,
  unavailableLabel,
} from "@/lib/ai-controls";
import { AI_MAX_OUTPUT_TOKENS } from "@/lib/config";

const schema = z.object({ answer: z.string() });
/**
 * A model that never calls the network (the seam's offline model), counting the AI calls it is
 * sent. With `gate`, each answer waits for it; `text` is its answer; with `fail`, it throws that
 * instead of answering.
 */
type OfflineModel = Extract<AiModel, { specificationVersion: "v4" }>;
function countingModel(gate?: Promise<void>, { text = '{"answer":"yes"}', fail }: { text?: string; fail?: Error } = {}) {
  const model = offlineModel(text) as OfflineModel;
  const answer = model.doGenerate.bind(model);
  const calls: unknown[] = [];
  const doGenerate: OfflineModel["doGenerate"] = async (options) => {
    calls.push(options);
    await gate;
    if (fail) throw fail;
    return answer(options);
  };
  return Object.assign(model, { calls, doGenerate });
}
const answering = () => countingModel();

let db: Db;
let pmId: number;
beforeEach(() => {
  db = createDb(":memory:");
  pmId = db.insert(people).values({ name: "Sam", role: "pm" }).returning().get().id;
});
afterEach(() => vi.unstubAllEnvs());

const NOON = new Date("2026-11-19T12:00:00.000Z");
/** Eval calls must bring a per-run meter; these need no cap. */
const unmetered: AiMeter = { beforeCall() {}, afterCall() {} };

/** An earlier app AI call that cost `costUsd`, at `time`. */
function spent(costUsd: number, time: Date, source: "app" | "seed" | "eval" = "app") {
  db.insert(aiCalls)
    .values({ time, module: "evaluator", model: "claude-sonnet-5-5", promptVersion: "x", outcome: "ok", source, costUsd, system: "s", prompt: "p" })
    .run();
}

const call = (module: CallableAiModule, model: AiModel = answering(), clock = () => NOON) =>
  aiGenerate({
    db,
    module,
    related: null,
    person: pmId,
    source: "app",
    system: "System.",
    prompt: "Prompt.",
    schema,
    maxOutputTokens: AI_MAX_OUTPUT_TOKENS[module],
    model,
    clock,
  });

/** The AI calls these tests made (not the earlier spend they set up). */
const rows = () => db.select().from(aiCalls).all().filter((r) => r.system === "System.");

describe("the daily app budget", () => {
  it.each(CALLABLE_AI_MODULES)("refuses a %s call whose worst case would cross today's remaining budget, without sending it", async (module) => {
    vi.stubEnv("AI_DAILY_BUDGET_USD", "2");
    spent(1.995, new Date("2026-11-19T09:00:00.000Z")); // $0.005 left: less than a full answer from any module
    const model = answering();

    const thrown = await call(module, model).catch((error) => error);

    expect(thrown).toBeInstanceOf(AiRefusal);
    expect(thrown).toMatchObject({ reason: "budget", module });
    expect(model.calls).toHaveLength(0);
    const [row] = rows();
    expect(row).toMatchObject({ module, outcome: "refused_budget", costUsd: 0, source: "app", personId: pmId });
    expect(row.time).toEqual(NOON);
    expect(failedAiCall(thrown)).toEqual({ id: row.id, outcome: "refused_budget" });
  });

  it("sends a call that fits in the remaining budget", async () => {
    vi.stubEnv("AI_DAILY_BUDGET_USD", "2");
    spent(1.9, new Date("2026-11-19T09:00:00.000Z"));
    await expect(call("matcher")).resolves.toMatchObject({ output: { answer: "yes" } });
    expect(rows()[0].outcome).toBe("ok");
  });

  it("defaults to $2 when AI_DAILY_BUDGET_USD isn't set", async () => {
    vi.stubEnv("AI_DAILY_BUDGET_USD", "");
    spent(1.995, new Date("2026-11-19T09:00:00.000Z"));
    await expect(call("matcher")).rejects.toBeInstanceOf(AiRefusal);
  });

  it("refuses every call, without sending, when AI_DAILY_BUDGET_USD isn't a valid amount", async () => {
    vi.stubEnv("AI_DAILY_BUDGET_USD", "lots");
    const model = answering();
    await expect(call("matcher", model)).rejects.toThrow(/AI_DAILY_BUDGET_USD/);
    expect(model.calls).toHaveLength(0);
    expect(rows()[0]).toMatchObject({ outcome: "refused_budget" });
  });

  it("counts only app AI calls: seed and eval spend keep their own meters", async () => {
    vi.stubEnv("AI_DAILY_BUDGET_USD", "1");
    spent(5, new Date("2026-11-19T09:00:00.000Z"), "seed");
    spent(5, new Date("2026-11-19T09:00:00.000Z"), "eval");
    await expect(call("evaluator")).resolves.toBeTruthy();
  });

  it("doesn't budget seed or eval calls themselves", async () => {
    vi.stubEnv("AI_DAILY_BUDGET_USD", "0");
    const model = answering();
    await aiGenerate({ db, module: "matcher", related: null, person: null, source: "eval", meter: unmetered, system: "System.", prompt: "Prompt.", schema, maxOutputTokens: 1_000, model, clock: () => NOON });
    expect(rows()[0].outcome).toBe("ok");
  });

  it("resets at 00:00 UTC: yesterday's spend doesn't count", async () => {
    vi.stubEnv("AI_DAILY_BUDGET_USD", "2");
    spent(2, new Date("2026-11-18T23:59:59.999Z"));
    const justBefore = () => new Date("2026-11-18T23:59:59.999Z");
    const midnight = () => new Date("2026-11-19T00:00:00.000Z");

    await expect(call("matcher", answering(), justBefore)).rejects.toBeInstanceOf(AiRefusal);
    await expect(call("matcher", answering(), midnight)).resolves.toBeTruthy();
    expect(rows().map((r) => r.outcome)).toEqual(["refused_budget", "ok"]);
  });

  it("counts calls still in flight, so concurrent calls can't overspend together", async () => {
    vi.stubEnv("AI_DAILY_BUDGET_USD", "0.04");
    // The Evaluator's worst case is a little over $0.015 (1,500 output tokens at $10/MTok), so two fit, not three.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = () => countingModel(gate);

    const results = [call("evaluator", slow()), call("evaluator", slow()), call("evaluator", slow())].map((p) =>
      p.then(() => "ok", (error) => (error instanceof AiRefusal ? error.reason : "error")),
    );
    release();
    expect(await Promise.all(results)).toEqual(["ok", "ok", "budget"]);
  });

  it.each([
    ["a model error", { fail: new Error("Anthropic API is down") }, "error"],
    ["a parse failure", { text: '{"wrong":1}' }, "parse_failed"],
  ] as const)("gives a call's reservation back after %s", async (_, failure, outcome) => {
    vi.stubEnv("AI_DAILY_BUDGET_USD", "0.02");
    // The Evaluator's worst case is a little over $0.015: one fits in $0.02, two don't.
    await expect(call("evaluator", countingModel(undefined, failure))).rejects.toThrow();
    // Had the failed call kept its reservation, this one wouldn't fit.
    await expect(call("evaluator")).resolves.toBeTruthy();
    expect(rows().map((r) => r.outcome)).toEqual([outcome, "ok"]);
  });

  it("reports today's spend, what's left and when the budget was first reached", async () => {
    vi.stubEnv("AI_DAILY_BUDGET_USD", "2");
    spent(1.5, new Date("2026-11-18T10:00:00.000Z")); // yesterday
    spent(1.99, new Date("2026-11-19T09:00:00.000Z"));
    expect(budgetStatus(db, NOON)).toEqual({ budgetUsd: 2, spentUsd: 1.99, remainingUsd: expect.closeTo(0.01, 8), reachedAt: null });

    await call("brief", answering(), () => new Date("2026-11-19T10:30:00.000Z")).catch(() => {});
    await call("matcher").catch(() => {});
    expect(budgetStatus(db, NOON).reachedAt).toEqual(new Date("2026-11-19T10:30:00.000Z"));
    // A new UTC day starts clean.
    expect(budgetStatus(db, new Date("2026-11-20T00:00:00.000Z"))).toMatchObject({ spentUsd: 0, reachedAt: null });
  });
});

describe("the off switch", () => {
  it.each(CALLABLE_AI_MODULES)("refuses an app call to a switched-off %s, without sending it", async (module) => {
    setModuleOn(db, module, false, pmId);
    const model = answering();

    const thrown = await call(module, model).catch((error) => error);

    expect(thrown).toBeInstanceOf(AiRefusal);
    expect(thrown).toMatchObject({ reason: "off", module });
    expect(model.calls).toHaveLength(0);
    const [row] = rows();
    expect(row).toMatchObject({ module, outcome: "refused_off", costUsd: 0 });
    expect(failedAiCall(thrown)).toEqual({ id: row.id, outcome: "refused_off" });
  });

  it("switches only that module off, and back on", async () => {
    setModuleOn(db, "brief", false, pmId);
    await expect(call("evaluator")).resolves.toBeTruthy();
    setModuleOn(db, "brief", true, pmId);
    await expect(call("brief")).resolves.toBeTruthy();
  });

  it("applies to the app only: an eval run ignores it", async () => {
    setModuleOn(db, "matcher", false, pmId);
    await aiGenerate({ db, module: "matcher", related: null, person: null, source: "eval", meter: unmetered, system: "System.", prompt: "Prompt.", schema, maxOutputTokens: 1_000, model: answering() });
    expect(rows()[0].outcome).toBe("ok");
  });

  it("starts with every module on", () => {
    expect(listAiControls(db).map((c) => [c.module, c.on, c.lastFlip])).toEqual(
      CALLABLE_AI_MODULES.map((m) => [m, true, null]),
    );
  });

  it("records every flip with who and when, and shows the last one", () => {
    setModuleOn(db, "matcher", false, pmId, new Date("2026-11-19T08:00:00.000Z"));
    setModuleOn(db, "matcher", true, pmId, new Date("2026-11-19T09:00:00.000Z"));
    expect(db.select().from(aiModuleFlips).all()).toMatchObject([
      { module: "matcher", on: false, personId: pmId },
      { module: "matcher", on: true, personId: pmId },
    ]);
    expect(listAiControls(db).find((c) => c.module === "matcher")).toEqual({
      module: "matcher",
      on: true,
      lastFlip: { on: true, personName: "Sam", at: new Date("2026-11-19T09:00:00.000Z") },
    });
  });
});

describe("moduleUnavailable (why a writer button is disabled)", () => {
  it("is null while a module is on and within budget", () => {
    expect(moduleUnavailable(db, "brief", NOON)).toBeNull();
  });

  it("says the module is off", () => {
    setModuleOn(db, "decision_note", false, pmId);
    expect(moduleUnavailable(db, "decision_note", NOON)).toBe("off");
    expect(moduleUnavailable(db, "brief", NOON)).toBeNull();
  });

  it("is per module: a refused Brief doesn't disable a cheaper Decision note draft that still fits", async () => {
    vi.stubEnv("AI_DAILY_BUDGET_USD", "2");
    spent(1.98, new Date("2026-11-19T09:00:00.000Z")); // $0.02 left: an $0.008 Decision note fits, a $0.025 brief can't
    expect(moduleUnavailable(db, "decision_note", NOON)).toBeNull();
    expect(moduleUnavailable(db, "brief", NOON)).toBe("budget");

    await expect(call("brief")).rejects.toBeInstanceOf(AiRefusal);
    expect(budgetStatus(db, NOON).reachedAt).toEqual(NOON); // the /review banner shows
    expect(moduleUnavailable(db, "decision_note", NOON)).toBeNull();
    expect(moduleUnavailable(db, "brief", NOON)).toBe("budget");
  });

  it("re-enables a module as soon as the budget is raised, mid-day, and at the next UTC day", async () => {
    vi.stubEnv("AI_DAILY_BUDGET_USD", "2");
    spent(1.995, new Date("2026-11-19T09:00:00.000Z"));
    await call("brief").catch(() => {});
    expect(moduleUnavailable(db, "brief", NOON)).toBe("budget");

    vi.stubEnv("AI_DAILY_BUDGET_USD", "3");
    expect(moduleUnavailable(db, "brief", NOON)).toBeNull();
    await expect(call("brief")).resolves.toBeTruthy();

    vi.stubEnv("AI_DAILY_BUDGET_USD", "2");
    expect(moduleUnavailable(db, "brief", NOON)).toBe("budget");
    expect(moduleUnavailable(db, "brief", new Date("2026-11-20T00:00:00.000Z"))).toBeNull();
  });

  it("treats a misconfigured budget as reached", () => {
    vi.stubEnv("AI_DAILY_BUDGET_USD", "lots");
    expect(moduleUnavailable(db, "decision_note", NOON)).toBe("budget");
  });
});

describe("disabledReason", () => {
  it("says why, or nothing when the module can run", () => {
    expect(disabledReason(db, "brief", NOON)).toBeNull();
    setModuleOn(db, "brief", false, pmId);
    expect(disabledReason(db, "brief", NOON)).toBe("The Brief writer is switched off in AI controls.");
  });

  it("disables the button, without throwing, when the AI controls can't be read", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db.run(sql`DROP TABLE ai_module_settings`);
    expect(disabledReason(db, "brief", NOON)).toBe("AI controls unavailable.");
    logged.mockRestore();
  });
});

describe("labels", () => {
  it("gives the /review banner's time as HH:MM UTC", () => {
    expect(budgetReachedLabel(new Date("2026-11-19T09:07:30.000Z"))).toBe("AI budget reached at 09:07 UTC; resets 00:00 UTC");
  });

  it("says why a button is disabled", () => {
    expect(unavailableLabel("brief", "off")).toBe("The Brief writer is switched off in AI controls.");
    expect(unavailableLabel("decision_note", "budget")).toBe(
      "AI budget reached for the Decision note drafter; resets 00:00 UTC.",
    );
  });
});

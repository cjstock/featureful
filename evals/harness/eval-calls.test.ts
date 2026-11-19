/**
 * The eval's Matcher calls must go through aiGenerate with the eval's meter, or the per-run cap
 * would be bypassed, and their AI call rows must land in the eval's own in-memory database.
 * Offline: the Matcher runs on the offline model and the API key is removed, so a call that
 * reached the real model would fail rather than spend.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db";
import { aiCalls } from "@/db/schema";
import { offlineModel } from "@/lib/ai";
import { createLlmMatcher } from "@/lib/intake/llm-matcher";
import { SEED_REQUESTS } from "../../scripts/seed-data";
import { CASES } from "../matcher/cases";
import { CapReachedError, createMeter, ESTIMATE_ANSWER, EVAL_CAP } from "./meter";
import { runEval } from "./run";

beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("the eval's AI calls", () => {
  it("meters every Matcher call at its worst case and records it in the eval's database with source eval", async () => {
    const db = createDb(":memory:");
    const meter = createMeter(EVAL_CAP);
    const worstCases: number[] = [];
    const matcher = createLlmMatcher(db, {
      source: "eval",
      person: null,
      model: offlineModel(ESTIMATE_ANSWER),
      meter: {
        beforeCall(worstCase) {
          worstCases.push(worstCase);
          meter.beforeCall(worstCase);
        },
        afterCall: meter.afterCall,
      },
    });

    await runEval(matcher, CASES.slice(0, 2), db);

    const calls = SEED_REQUESTS.length + 2;
    expect(meter.totals().calls).toBe(calls);
    // Each worst case includes a full 1,000-token Matcher answer at $10/MTok.
    expect(Math.min(...worstCases)).toBeGreaterThan(0.01);
    const rows = db.select().from(aiCalls).all();
    expect(rows).toHaveLength(calls);
    expect(rows.every((r) => r.source === "eval" && r.module === "matcher" && r.outcome === "ok")).toBe(true);
  });

  it("stops the run when the cap is reached, recording the refused AI call", async () => {
    const db = createDb(":memory:");
    const meter = createMeter({ maxCalls: 3, maxCostUsd: 1 });
    const matcher = createLlmMatcher(db, { source: "eval", person: null, model: offlineModel(ESTIMATE_ANSWER), meter });

    await expect(runEval(matcher, CASES, db)).rejects.toThrow(CapReachedError);

    expect(meter.totals().calls).toBe(3);
    const outcomes = db.select({ outcome: aiCalls.outcome }).from(aiCalls).all().map((r) => r.outcome);
    expect(outcomes).toEqual(["ok", "ok", "ok", "refused_budget"]);
  });
});

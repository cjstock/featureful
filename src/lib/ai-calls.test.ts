import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db";
import { aiCalls, people, problems, type Person } from "@/db/schema";
import { formatAiCallLine, getAiCallContent, latestEvaluationCall } from "@/lib/ai-calls";

let db: Db;
let pm: Person;
let agent: Person;
let customer: Person;

const call = (overrides: Partial<typeof aiCalls.$inferInsert> = {}) =>
  db
    .insert(aiCalls)
    .values({
      module: "evaluator",
      model: "claude-sonnet-5-5",
      promptVersion: "3f9a1c2e",
      outcome: "ok",
      source: "app",
      system: "You evaluate customer Problems.",
      prompt: "Problem: Repeat a brew",
      output: '{"impact":{"score":4}}',
      costUsd: 0.0042,
      latencyMs: 1_234,
      relatedType: "problem",
      relatedId: 1,
      ...overrides,
    })
    .returning()
    .get();

beforeEach(() => {
  db = createDb(":memory:");
  [pm, agent, customer] = db
    .insert(people)
    .values([
      { name: "Sam", role: "pm" },
      { name: "Dana", role: "support_agent" },
      { name: "Alex", role: "customer" },
    ])
    .returning()
    .all();
  db.insert(problems).values({ title: "Repeat a brew", need: "I need to repeat a brew." }).run();
});

describe("formatAiCallLine", () => {
  it("names the module, prompt version, cost and latency", () => {
    expect(
      formatAiCallLine({ module: "matcher", promptVersion: "3f9a1c2e", costUsd: 0.0042, latencyMs: 1_234, outcome: "ok" }),
    ).toBe("Matcher · v3f9a · $0.004 · 1.2s");
  });

  it("says when the AI call didn't succeed", () => {
    expect(
      formatAiCallLine({ module: "evaluator", promptVersion: "3f9a1c2e", costUsd: 0, latencyMs: 300, outcome: "error" }),
    ).toBe("Evaluator · v3f9a · $0.000 · 0.3s · error");
  });
});

describe("getAiCallContent", () => {
  it("gives a PM the stored prompt, output and the Problems shown", () => {
    const shown = [{ id: 1, title: "Repeat a brew", need: "I need to repeat a brew." }];
    const { id } = call({ module: "matcher", shownProblems: shown });
    expect(getAiCallContent(db, pm, id)).toMatchObject({
      id,
      module: "matcher",
      system: "You evaluate customer Problems.",
      prompt: "Problem: Repeat a brew",
      output: '{"impact":{"score":4}}',
      shownProblems: shown,
    });
  });

  it("rejects anyone who isn't a PM", () => {
    const { id } = call();
    expect(() => getAiCallContent(db, agent, id)).toThrow(/only pm/i);
    expect(() => getAiCallContent(db, customer, id)).toThrow(/only pm/i);
  });

  it("returns null for an AI call that doesn't exist", () => {
    expect(getAiCallContent(db, pm, 42)).toBeNull();
  });
});

describe("latestEvaluationCall", () => {
  it("is the newest successful Evaluator call for the Problem, the one behind its current scores", () => {
    call({ time: new Date(1_000), latencyMs: 1 });
    const latest = call({ time: new Date(2_000), latencyMs: 2 });
    call({ time: new Date(3_000), outcome: "error" });
    call({ time: new Date(4_000), module: "brief" });
    call({ time: new Date(5_000), relatedId: 2 });

    expect(latestEvaluationCall(db, 1)).toMatchObject({ id: latest.id, latencyMs: 2 });
    expect(latestEvaluationCall(db, 3)).toBeNull();
  });
});

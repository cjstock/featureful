import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db";
import { aiCalls, people, problems, requests, type AiCallOutcome } from "@/db/schema";
import { evaluationFreshness, failedAtLabel, isFresh, listEvaluationFreshness } from "@/lib/evaluation-freshness";

let db: Db;
let authorId: number;

const at = (minute: number) => new Date(Date.UTC(2026, 10, 19, 9, minute));

function problem(evaluatedAt: Date | null = null) {
  return db
    .insert(problems)
    .values({ title: "Repeat a brew", need: "I need to repeat a brew.", evaluatedAt })
    .returning()
    .get().id;
}

function evidence(problemId: number, createdAt: Date) {
  db.insert(requests).values({ problemId, authorId, title: "Please", description: "Please help.", createdAt }).run();
}

function evaluatorCall(problemId: number, time: Date, outcome: AiCallOutcome, overrides: Partial<typeof aiCalls.$inferInsert> = {}) {
  db.insert(aiCalls)
    .values({
      time,
      module: "evaluator",
      model: "claude-sonnet-5-5",
      promptVersion: "3f9a1c2e",
      outcome,
      source: "app",
      system: "You evaluate customer Problems.",
      prompt: "Problem: Repeat a brew",
      relatedType: "problem",
      relatedId: problemId,
      ...overrides,
    })
    .run();
}

beforeEach(() => {
  db = createDb(":memory:");
  authorId = db.insert(people).values({ name: "Alex", role: "customer" }).returning().get().id;
});

describe("evaluationFreshness: stale", () => {
  it("is stale when Evidence arrived after the last evaluation", () => {
    const id = problem(at(10));
    evidence(id, at(5));
    evidence(id, at(11));
    expect(evaluationFreshness(db, id).stale).toBe(true);
  });

  it("is not stale when the newest Evidence has the same timestamp as the evaluation", () => {
    const id = problem(at(10));
    evidence(id, at(10));
    expect(evaluationFreshness(db, id).stale).toBe(false);
  });

  it("is not stale when all Evidence predates the evaluation", () => {
    const id = problem(at(10));
    evidence(id, at(9));
    expect(evaluationFreshness(db, id).stale).toBe(false);
  });

  it("is not stale when the Problem was never evaluated (it is Not evaluated instead)", () => {
    const id = problem(null);
    evidence(id, at(9));
    expect(evaluationFreshness(db, id)).toEqual({ stale: false, failedAt: null });
  });

  it("is not stale without any Evidence", () => {
    expect(evaluationFreshness(db, problem(at(10))).stale).toBe(false);
  });
});

describe("evaluationFreshness: failed", () => {
  it("reports when the latest Evaluator AI call didn't return ok", () => {
    const id = problem(at(10));
    evaluatorCall(id, at(10), "ok");
    evaluatorCall(id, at(20), "parse_failed");
    expect(evaluationFreshness(db, id).failedAt).toEqual(at(20));
  });

  it("is not failed when an older failure was followed by a newer ok", () => {
    const id = problem(at(30));
    evaluatorCall(id, at(20), "error");
    evaluatorCall(id, at(30), "ok");
    expect(evaluationFreshness(db, id).failedAt).toBeNull();
  });

  it("goes by time, not insertion order", () => {
    const id = problem(at(30));
    evaluatorCall(id, at(30), "ok");
    evaluatorCall(id, at(20), "refused_budget");
    expect(evaluationFreshness(db, id).failedAt).toBeNull();
  });

  it("counts refusals (over budget, switched off) as failures", () => {
    const id = problem();
    evaluatorCall(id, at(5), "refused_off");
    expect(evaluationFreshness(db, id).failedAt).toEqual(at(5));
  });

  it("is not failed for a Problem the Evaluator never ran on", () => {
    expect(evaluationFreshness(db, problem()).failedAt).toBeNull();
  });

  it("ignores other modules' AI calls and other Problems' Evaluator calls", () => {
    const id = problem(at(10));
    const other = problem(at(10));
    evaluatorCall(id, at(10), "ok");
    evaluatorCall(id, at(20), "error", { module: "brief" });
    evaluatorCall(other, at(20), "error");
    evaluatorCall(id, at(20), "error", { relatedType: "request" });
    expect(evaluationFreshness(db, id).failedAt).toBeNull();
    expect(evaluationFreshness(db, other).failedAt).toEqual(at(20));
  });
});

describe("listEvaluationFreshness", () => {
  it("gives every Problem the same answer as evaluationFreshness, in one go", () => {
    const fresh = problem(at(10));
    evidence(fresh, at(10));
    evaluatorCall(fresh, at(9), "error");
    evaluatorCall(fresh, at(10), "ok");

    const stale = problem(at(10));
    evidence(stale, at(11));

    const failed = problem(at(10));
    evaluatorCall(failed, at(10), "ok");
    evaluatorCall(failed, at(20), "error");
    evaluatorCall(failed, at(20), "parse_failed"); // same time: the later AI call wins

    const never = problem();

    const all = listEvaluationFreshness(db);
    expect(all.get(fresh)).toEqual({ stale: false, failedAt: null });
    expect(all.get(stale)).toEqual({ stale: true, failedAt: null });
    expect(all.get(failed)).toEqual({ stale: false, failedAt: at(20) });
    expect(all.get(never)).toEqual({ stale: false, failedAt: null });
    for (const id of [fresh, stale, failed, never]) expect(all.get(id)).toEqual(evaluationFreshness(db, id));
  });
});

describe("failedAtLabel", () => {
  it("gives the failure time as HH:MM in UTC, labelled", () => {
    expect(failedAtLabel(new Date(Date.UTC(2026, 10, 19, 21, 5)))).toBe("Evaluation failed at 21:05 UTC");
    expect(failedAtLabel(new Date(Date.UTC(2026, 10, 19, 0, 7)))).toBe("Evaluation failed at 00:07 UTC");
  });
});

describe("isFresh", () => {
  it("is fresh only when neither stale nor failed", () => {
    expect(isFresh({ stale: false, failedAt: null })).toBe(true);
    expect(isFresh({ stale: true, failedAt: null })).toBe(false);
    expect(isFresh({ stale: false, failedAt: at(1) })).toBe(false);
  });
});

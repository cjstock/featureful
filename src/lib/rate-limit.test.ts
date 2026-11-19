/**
 * The `/submit` rate limits, per person over a rolling hour: at most 10 Requests saved, and at most
 * 20 Matcher proposals (twice the submit limit).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db";
import { aiCalls, people, problems, requests, type AiCallOutcome } from "@/db/schema";
import { PROPOSE_RATE_LIMIT, REQUEST_RATE_LIMIT } from "@/lib/config";
import { checkProposeRateLimit, checkSubmitRateLimit } from "@/lib/rate-limit";

let db: Db;
let alex: number;
let priya: number;
let problemId: number;

beforeEach(() => {
  db = createDb(":memory:");
  [alex, priya] = db
    .insert(people)
    .values([
      { name: "Alex", role: "customer" },
      { name: "Priya", role: "customer" },
    ])
    .returning()
    .all()
    .map((p) => p.id);
  problemId = db.insert(problems).values({ title: "Repeat a brew", need: "I need to." }).returning().get().id;
});

const at = (h: number, m: number, s = 0) => new Date(Date.UTC(2026, 10, 19, h, m, s));

function submitted(authorId: number, createdAt: Date) {
  db.insert(requests).values({ problemId, authorId, title: "T", description: "D", createdAt }).run();
}

function matcherCall(
  personId: number,
  time: Date,
  outcome: AiCallOutcome = "ok",
  overrides: Partial<typeof aiCalls.$inferInsert> = {},
) {
  db.insert(aiCalls)
    .values({ time, module: "matcher", model: "claude-sonnet-5-5", promptVersion: "x", outcome, source: "app", personId, system: "s", prompt: "p", ...overrides })
    .run();
}

it("keeps both limits in config: 10 Requests and 20 proposals an hour", () => {
  expect(REQUEST_RATE_LIMIT).toEqual({ max: 10, windowMs: 3_600_000 });
  expect(PROPOSE_RATE_LIMIT).toEqual({ max: 20, windowMs: 3_600_000 });
});

describe("checkSubmitRateLimit", () => {
  it("allows the 10th submission in an hour and rejects the 11th, until the oldest is an hour old", () => {
    for (let i = 0; i < 9; i++) submitted(alex, at(14, 5 + i));
    expect(checkSubmitRateLimit(db, alex, at(14, 30))).toEqual({ ok: true }); // the 10th
    submitted(alex, at(14, 30));

    expect(checkSubmitRateLimit(db, alex, at(14, 31))).toEqual({
      ok: false,
      retryAt: at(15, 5),
      message: "You've submitted 10 Requests in the last hour. Try again at 15:05 UTC.",
    });
    expect(checkSubmitRateLimit(db, alex, at(15, 4, 59))).toMatchObject({ ok: false });
    // At 15:05 the 14:05 submission is an hour old and leaves the window.
    expect(checkSubmitRateLimit(db, alex, at(15, 5))).toEqual({ ok: true });
  });

  it("counts each person separately", () => {
    for (let i = 0; i < 10; i++) submitted(alex, at(14, i));
    expect(checkSubmitRateLimit(db, alex, at(14, 30)).ok).toBe(false);
    expect(checkSubmitRateLimit(db, priya, at(14, 30)).ok).toBe(true);
  });

  it("rounds the retry time up to the next minute, so trying at that minute works", () => {
    for (let i = 0; i < 10; i++) submitted(alex, at(14, 5, 1));
    expect(checkSubmitRateLimit(db, alex, at(14, 30))).toMatchObject({ message: expect.stringContaining("Try again at 15:06 UTC.") });
  });
});

describe("checkProposeRateLimit", () => {
  it("allows the 20th Matcher proposal in an hour and rejects the 21st, until the oldest is an hour old", () => {
    for (let i = 0; i < 19; i++) matcherCall(alex, at(14, i));
    expect(checkProposeRateLimit(db, alex, at(14, 30))).toEqual({ ok: true }); // the 20th
    matcherCall(alex, at(14, 30));

    expect(checkProposeRateLimit(db, alex, at(14, 31))).toEqual({
      ok: false,
      retryAt: at(15, 0),
      message: "You've checked 20 Requests for matches in the last hour. Try again at 15:00 UTC.",
    });
    expect(checkProposeRateLimit(db, alex, at(15, 0))).toEqual({ ok: true });
  });

  it("counts Matcher calls whatever their outcome, refused ones included", () => {
    const outcomes: AiCallOutcome[] = ["ok", "error", "parse_failed", "refused_budget", "refused_off"];
    for (let i = 0; i < 20; i++) matcherCall(alex, at(14, i), outcomes[i % outcomes.length]);
    expect(checkProposeRateLimit(db, alex, at(14, 30)).ok).toBe(false);
  });

  it("counts only this person's app Matcher calls", () => {
    for (let i = 0; i < 20; i++) matcherCall(priya, at(14, i));
    for (let i = 0; i < 20; i++) matcherCall(alex, at(14, i), "ok", { module: "evaluator" });
    for (let i = 0; i < 20; i++) matcherCall(alex, at(14, i), "ok", { source: "eval", personId: null });
    expect(checkProposeRateLimit(db, alex, at(14, 30)).ok).toBe(true);
    expect(checkProposeRateLimit(db, priya, at(14, 30)).ok).toBe(false);
  });

  it("counts proposals still waiting on the Matcher, which aren't recorded yet", () => {
    for (let i = 0; i < 18; i++) matcherCall(alex, at(14, i));
    expect(checkProposeRateLimit(db, alex, at(14, 30), 1).ok).toBe(true); // 18 + 1 pending: the 20th fits
    expect(checkProposeRateLimit(db, alex, at(14, 30), 2)).toMatchObject({ ok: false, retryAt: at(15, 0) });
  });
});

/** The submit rate limit: at most 10 Requests per person in any rolling hour. */
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db";
import { people, problems, requests } from "@/db/schema";
import { checkSubmitRateLimit, rateLimitMessage } from "@/lib/rate-limit";

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

describe("checkSubmitRateLimit", () => {
  it("allows the 10th submission in an hour and rejects the 11th, until the oldest is an hour old", () => {
    for (let i = 0; i < 9; i++) submitted(alex, at(14, 5 + i));
    expect(checkSubmitRateLimit(db, alex, at(14, 30))).toEqual({ ok: true }); // the 10th
    submitted(alex, at(14, 30));

    expect(checkSubmitRateLimit(db, alex, at(14, 31))).toEqual({ ok: false, retryAt: at(15, 5) }); // the 11th
    expect(checkSubmitRateLimit(db, alex, at(15, 4, 59))).toMatchObject({ ok: false });
    // At 15:05 the 14:05 submission is an hour old and leaves the window.
    expect(checkSubmitRateLimit(db, alex, at(15, 5))).toEqual({ ok: true });
  });

  it("counts each person separately", () => {
    for (let i = 0; i < 10; i++) submitted(alex, at(14, i));
    expect(checkSubmitRateLimit(db, alex, at(14, 30)).ok).toBe(false);
    expect(checkSubmitRateLimit(db, priya, at(14, 30)).ok).toBe(true);
  });
});

describe("rateLimitMessage", () => {
  it("says when to try again, as HH:MM UTC", () => {
    expect(rateLimitMessage(at(15, 5))).toBe(
      "You've submitted 10 Requests in the last hour. Try again at 15:05 UTC.",
    );
  });

  it("rounds the time up to the next minute, so trying at that minute works", () => {
    expect(rateLimitMessage(at(15, 5, 1))).toContain("Try again at 15:06 UTC");
  });
});

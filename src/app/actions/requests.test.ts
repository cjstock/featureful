/**
 * The submit rate limit is enforced in the server actions themselves, so a direct POST can't skip
 * it. The identity cookie and the app database are swapped for test ones. No AI call is made: a
 * confirm makes none, and a rate-limited propose is rejected before the Matcher runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/db";
import { aiCalls, people, problems, requests } from "@/db/schema";

let db: Db;
let personId: number | undefined;

vi.mock("@/db/client", () => ({ getDb: () => db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (personId === undefined ? undefined : { value: String(personId) }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));

const { confirmRequest, proposeRequest } = await import("./requests");

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
  vi.spyOn(console, "error").mockImplementation(() => {});
  // A safety net: should a test ever reach the Matcher, the budget refuses it before it is sent.
  vi.stubEnv("AI_DAILY_BUDGET_USD", "0");
});
afterEach(() => vi.unstubAllEnvs());

const draft = (i: number) => ({ title: `Request ${i}`, description: "Let me save a recipe." });
const submit = (i: number) => confirmRequest(draft(i), { match: null, newProblem: draft(i) } as never, { attachTo: problemId });
const savedBy = (authorId: number) => db.select().from(requests).all().filter((r) => r.authorId === authorId);

describe("the submit rate limit", () => {
  it("saves 10 Requests from one person within an hour and rejects the 11th, saying when to try again", async () => {
    personId = alex;
    for (let i = 1; i <= 10; i++) expect(await submit(i)).toMatchObject({ ok: true });

    const eleventh = await submit(11);

    expect(eleventh).toEqual({
      ok: false,
      error: expect.stringMatching(/^You've submitted 10 Requests in the last hour\. Try again at \d\d:\d\d UTC\.$/),
    });
    expect(savedBy(alex)).toHaveLength(10);
  });

  it("rejects an 11th propose before the Matcher runs, so it costs nothing", async () => {
    personId = alex;
    for (let i = 1; i <= 10; i++) await submit(i);

    expect(await proposeRequest(draft(11))).toMatchObject({ ok: false, error: expect.stringContaining("Try again at") });
    expect(db.select().from(aiCalls).all()).toEqual([]);
  });

  it("limits each person separately", async () => {
    personId = alex;
    for (let i = 1; i <= 10; i++) await submit(i);
    personId = priya;
    expect(await submit(11)).toMatchObject({ ok: true });
  });
});

describe("the propose rate limit", () => {
  // The $0 budget refuses every Matcher call before it is sent, so each propose still records one
  // (refused) Matcher AI call and returns a bypassed proposal, without any network call.
  const matcherCalls = (by: number) => db.select().from(aiCalls).all().filter((c) => c.module === "matcher" && c.personId === by);

  it("lets one person ask the Matcher 20 times an hour and rejects the 21st before the Matcher runs", async () => {
    personId = alex;
    for (let i = 1; i <= 20; i++) {
      expect(await proposeRequest(draft(i))).toMatchObject({ ok: true, proposal: { matcherOutcome: "budget" } });
    }
    expect(matcherCalls(alex)).toHaveLength(20);

    expect(await proposeRequest(draft(21))).toEqual({
      ok: false,
      error: expect.stringMatching(/^You've checked 20 Requests for matches in the last hour\. Try again at \d\d:\d\d UTC\.$/),
    });
    expect(matcherCalls(alex)).toHaveLength(20);

    personId = priya;
    expect(await proposeRequest(draft(1))).toMatchObject({ ok: true });
  });
});

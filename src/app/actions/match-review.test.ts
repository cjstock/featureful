/**
 * The Match review server action is reachable by anyone who can POST to it, so it must check the
 * role itself. The identity cookie and the app database are swapped for test ones.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/db";
import { matchingDecisions, people, problems } from "@/db/schema";
import { createIntake } from "@/lib/intake";

let db: Db;
let personId: number | undefined;

vi.mock("@/db/client", () => ({ getDb: () => db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (personId === undefined ? undefined : { value: String(personId) }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));

const { reviewMatch } = await import("./match-review");

let ids: { customer: number; agent: number; pm: number; decision: number; other: number };
beforeEach(async () => {
  db = createDb(":memory:");
  const [customer, agent, pm] = db
    .insert(people)
    .values([
      { name: "Alex", role: "customer" },
      { name: "Dana", role: "support_agent" },
      { name: "Sam", role: "pm" },
    ])
    .returning()
    .all();
  const [grind, other] = db
    .insert(problems)
    .values([
      { title: "Dial in grind size", need: "I need to remember grind settings." },
      { title: "Taste", need: "I need to taste." },
    ])
    .returning()
    .all();
  const newProblem = { title: "Cupping", need: "I need to log cuppings." };
  const intake = createIntake({ db, matcher: async () => ({ match: null, newProblem }) });
  const draft = { title: "Cupping log", description: "Log cuppings." };
  intake.confirm(draft, await intake.propose(draft), { attachTo: grind.id }, customer.id);
  const decision = db.select().from(matchingDecisions).get()!;
  ids = { customer: customer.id, agent: agent.id, pm: pm.id, decision: decision.id, other: other.id };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const verdict = () => db.select().from(matchingDecisions).get()!.verdict;

describe("reviewMatch", () => {
  it.each(["customer", "agent"] as const)("rejects a %s and records nothing", async (who) => {
    personId = ids[who];
    expect(await reviewMatch(ids.decision, { verdict: "confirm" })).toEqual({ ok: false, error: "Only pm can do this" });
    expect(
      await reviewMatch(ids.decision, { verdict: "move", targetProblemId: ids.other, note: "Different need." }),
    ).toEqual({ ok: false, error: "Only pm can do this" });
    expect(verdict()).toBeNull();
  });

  it("rejects a visitor with no identity", async () => {
    personId = undefined;
    expect((await reviewMatch(ids.decision, { verdict: "confirm" })).ok).toBe(false);
    expect(verdict()).toBeNull();
  });

  it("lets a PM review, and refuses a Move without a note", async () => {
    personId = ids.pm;
    const refused = await reviewMatch(ids.decision, { verdict: "move", targetProblemId: ids.other, note: " " });
    expect(refused).toMatchObject({ ok: false });
    expect(verdict()).toBeNull();

    expect(await reviewMatch(ids.decision, { verdict: "confirm" })).toEqual({ ok: true });
    expect(verdict()).toBe("confirm");
  });
});

/**
 * The off switch server action is reachable by anyone who can POST to it, so it must check the
 * PM role itself. The identity cookie and the app database are swapped for test ones.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/db";
import { aiModuleFlips, people } from "@/db/schema";
import { isModuleOn } from "@/lib/ai-controls";

let db: Db;
let personId: number | undefined;

vi.mock("@/db/client", () => ({ getDb: () => db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (personId === undefined ? undefined : { value: String(personId) }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { setAiModuleOn } = await import("./ai-controls");

let ids: { customer: number; agent: number; pm: number };
beforeEach(() => {
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
  ids = { customer: customer.id, agent: agent.id, pm: pm.id };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("setAiModuleOn", () => {
  it.each(["customer", "agent"] as const)("rejects a %s, leaving the switch and its audit untouched", async (who) => {
    personId = ids[who];
    expect(await setAiModuleOn("matcher", false)).toEqual({ ok: false, error: "Only pm can do this" });
    expect(isModuleOn(db, "matcher")).toBe(true);
    expect(db.select().from(aiModuleFlips).all()).toEqual([]);
  });

  it("rejects a visitor with no identity cookie (who falls back to the first person, a Customer)", async () => {
    personId = undefined;
    expect(await setAiModuleOn("evaluator", false)).toEqual({ ok: false, error: "Only pm can do this" });
    expect(isModuleOn(db, "evaluator")).toBe(true);
  });

  it("lets a PM switch a module off and on, recording each flip as theirs", async () => {
    personId = ids.pm;
    expect(await setAiModuleOn("brief", false)).toEqual({ ok: true });
    expect(isModuleOn(db, "brief")).toBe(false);
    expect(await setAiModuleOn("brief", true)).toEqual({ ok: true });
    expect(db.select().from(aiModuleFlips).all()).toMatchObject([
      { module: "brief", on: false, personId: ids.pm },
      { module: "brief", on: true, personId: ids.pm },
    ]);
  });

  it("rejects a module that isn't callable (a retired one, or made up)", async () => {
    personId = ids.pm;
    expect((await setAiModuleOn("boundary_note" as never, false)).ok).toBe(false);
    expect((await setAiModuleOn("nonsense" as never, false)).ok).toBe(false);
    expect((await setAiModuleOn("matcher", "no" as never)).ok).toBe(false);
    expect(db.select().from(aiModuleFlips).all()).toEqual([]);
  });
});

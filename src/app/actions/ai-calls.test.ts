/**
 * The "view prompt" server action is reachable by anyone who can POST to it, so it must check the
 * role itself. The identity cookie and the app database are swapped for test ones.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/db";
import { aiCalls, people } from "@/db/schema";

let db: Db;
let personId: number | undefined;

vi.mock("@/db/client", () => ({ getDb: () => db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (personId === undefined ? undefined : { value: String(personId) }) }),
}));

const { viewAiCall } = await import("./ai-calls");

let ids: { customer: number; agent: number; pm: number; call: number };
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
  const call = db
    .insert(aiCalls)
    .values({
      module: "matcher",
      model: "claude-sonnet-5-5",
      promptVersion: "3f9a1c2e",
      outcome: "ok",
      source: "app",
      system: "SECRET SYSTEM PROMPT",
      prompt: "Customer text",
      output: "{}",
    })
    .returning()
    .get();
  ids = { customer: customer.id, agent: agent.id, pm: pm.id, call: call.id };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("viewAiCall", () => {
  it("gives a PM the stored prompt and output", async () => {
    personId = ids.pm;
    const result = await viewAiCall(ids.call);
    expect(result).toMatchObject({ ok: true, aiCall: { system: "SECRET SYSTEM PROMPT", prompt: "Customer text" } });
  });

  it.each(["customer", "agent"] as const)("rejects a %s without returning any content", async (who) => {
    personId = ids[who];
    const result = await viewAiCall(ids.call);
    expect(result).toEqual({ ok: false, error: "Only pm can do this" });
  });

  it("rejects a visitor with no identity cookie (who falls back to the first person, a Customer)", async () => {
    personId = undefined;
    expect(await viewAiCall(ids.call)).toEqual({ ok: false, error: "Only pm can do this" });
  });
});

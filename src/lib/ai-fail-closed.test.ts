/**
 * `aiGenerate` fails closed: if the AI controls (the off switch, today's spend) can't be read, an
 * app AI call is not sent, and an error row is still written when the database allows. The
 * controls are mocked to throw; everything else is real. Offline model only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createDb, type Db } from "@/db";
import { aiCalls, people } from "@/db/schema";
import { aiGenerate, offlineModel, type AiModel } from "@/lib/ai";

const broken = vi.hoisted(() => ({ isModuleOn: false, appSpendToday: false }));

vi.mock("@/lib/ai-controls", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ai-controls")>();
  return {
    ...real,
    isModuleOn: (...args: Parameters<typeof real.isModuleOn>) => {
      if (broken.isModuleOn) throw new Error("can't read the off switch");
      return real.isModuleOn(...args);
    },
    appSpendToday: (...args: Parameters<typeof real.appSpendToday>) => {
      if (broken.appSpendToday) throw new Error("can't read today's spend");
      return real.appSpendToday(...args);
    },
  };
});

type OfflineModel = Extract<AiModel, { specificationVersion: "v4" }>;
function countingModel() {
  const model = offlineModel('{"answer":"yes"}') as OfflineModel;
  const answer = model.doGenerate.bind(model);
  const calls: unknown[] = [];
  const doGenerate: OfflineModel["doGenerate"] = async (options) => {
    calls.push(options);
    return answer(options);
  };
  return Object.assign(model, { calls, doGenerate });
}

let db: Db;
let pmId: number;
beforeEach(() => {
  db = createDb(":memory:");
  pmId = db.insert(people).values({ name: "Sam", role: "pm" }).returning().get().id;
  broken.isModuleOn = false;
  broken.appSpendToday = false;
});
afterEach(() => vi.restoreAllMocks());

const call = (model: AiModel) =>
  aiGenerate({
    db,
    module: "evaluator",
    related: null,
    person: pmId,
    source: "app",
    system: "System.",
    prompt: "Prompt.",
    schema: z.object({ answer: z.string() }),
    maxOutputTokens: 1_500,
    model,
  });

describe("aiGenerate when the AI controls can't be read", () => {
  it.each([
    ["the off switch", "isModuleOn", /off switch/],
    ["today's spend", "appSpendToday", /today's spend/],
  ] as const)("doesn't send an app call when %s can't be read, and records an error row", async (_, which, error) => {
    broken[which] = true;
    const model = countingModel();

    await expect(call(model)).rejects.toThrow(error);

    expect(model.calls).toHaveLength(0);
    expect(db.select().from(aiCalls).all()).toEqual([
      expect.objectContaining({ outcome: "error", error: expect.stringMatching(error), costUsd: 0 }),
    ]);
  });

  it("sends it once they can be read again", async () => {
    const model = countingModel();
    await expect(call(model)).resolves.toBeTruthy();
    expect(model.calls).toHaveLength(1);
  });
});

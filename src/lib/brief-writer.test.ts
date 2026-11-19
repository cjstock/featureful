/**
 * The Brief writer's Evidence quotes are bounded, so long Request descriptions can't push a brief
 * past its 2,500-token output cap. Offline: the brief comes from the offline model.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createDb, type Db } from "@/db";
import { aiCalls, people, problems, requests } from "@/db/schema";
import { offlineModel } from "@/lib/ai";
import { briefSchema, generateBrief, MAX_QUOTE_CHARS } from "@/lib/brief-writer";

const brief = (quote: string) =>
  JSON.stringify({
    problemStatement: "Home brewers want to repeat a good brew.",
    evidence: { summary: "People lose good recipes.", quotes: [{ text: quote, author: "Alex" }] },
    scoreBreakdown: { summary: "Not evaluated yet." },
    recommendation: { decision: "do", reasoning: "It is a core workflow." },
    openQuestions: ["Which brew methods first?"],
  });

let db: Db;
let problemId: number;
beforeEach(() => {
  db = createDb(":memory:");
  const alex = db.insert(people).values({ name: "Alex", role: "customer" }).returning().get();
  problemId = db
    .insert(problems)
    .values({ title: "Repeat a brew", need: "I need to repeat a good brew." })
    .returning()
    .get().id;
  db.insert(requests)
    .values({ problemId, authorId: alex.id, title: "Save recipes", description: "x".repeat(5_000) })
    .run();
});

describe("the Brief writer's quotes", () => {
  it("tell the model each quote is a short excerpt of at most ~300 characters", () => {
    expect(MAX_QUOTE_CHARS).toBe(300);
    const json = JSON.stringify(z.toJSONSchema(briefSchema));
    expect(json).toContain('"maxLength":300');
    expect(json).toContain("A short verbatim excerpt (at most ~300 characters)");
  });

  it("accept a 300-character quote", async () => {
    const stored = await generateBrief(db, problemId, {
      source: "app",
      person: null,
      model: offlineModel(brief("q".repeat(300))),
    });
    expect(stored.markdown).toContain("q".repeat(300));
  });

  it("reject a longer quote as parse_failed, keeping no brief", async () => {
    await expect(
      generateBrief(db, problemId, { source: "app", person: null, model: offlineModel(brief("q".repeat(301))) }),
    ).rejects.toThrow();
    expect(db.select({ outcome: aiCalls.outcome }).from(aiCalls).get()).toEqual({ outcome: "parse_failed" });
    expect(db.select({ markdown: problems.briefMarkdown }).from(problems).get()).toEqual({ markdown: null });
  });
});

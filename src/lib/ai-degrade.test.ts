/**
 * Out of budget or switched off, each AI module degrades instead of blocking: the Matcher's
 * Request still saves as a new Problem escalated as Bypassed, the Evaluator leaves the Problem
 * "Not evaluated" with the reason, and the writers refuse (their buttons are disabled). Each runs
 * the real module over an offline model that must never be called.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/db";
import { aiCalls, matchingDecisions, people, problems, requests } from "@/db/schema";
import { AiRefusal, offlineModel, type AiCaller, type AiModel } from "@/lib/ai";
import { setModuleOn } from "@/lib/ai-controls";
import { generateBrief, getBrief } from "@/lib/brief-writer";
import { draftDecisionNote } from "@/lib/decision-note";
import { evaluationFreshness, notEvaluatedLabel } from "@/lib/evaluation-freshness";
import { tryEvaluateProblem } from "@/lib/evaluator";
import { createIntake } from "@/lib/intake";
import { createLlmMatcher } from "@/lib/intake/llm-matcher";

/**
 * A model that never calls the network (the seam's offline model), counting the AI calls it is
 * sent. With `gate`, each answer waits for it.
 */
type OfflineModel = Extract<AiModel, { specificationVersion: "v4" }>;
function countingModel(gate?: Promise<void>) {
  const model = offlineModel('{}') as OfflineModel;
  const answer = model.doGenerate.bind(model);
  const calls: unknown[] = [];
  const doGenerate: OfflineModel["doGenerate"] = async (options) => {
    calls.push(options);
    await gate;
    return answer(options);
  };
  return Object.assign(model, { calls, doGenerate });
}

let db: Db;
let pmId: number;
let customerId: number;
let problemId: number;
let model: ReturnType<typeof countingModel>;
let caller: (personId: number) => AiCaller;

beforeEach(() => {
  db = createDb(":memory:");
  [customerId, pmId] = db
    .insert(people)
    .values([
      { name: "Alex", role: "customer" },
      { name: "Sam", role: "pm" },
    ])
    .returning()
    .all()
    .map((p) => p.id);
  problemId = db.insert(problems).values({ title: "Repeat a brew", need: "I need to repeat a good brew." }).returning().get().id;
  db.insert(requests).values({ problemId, authorId: customerId, title: "Save recipes", description: "Let me save a recipe." }).run();
  model = countingModel();
  caller = (personId) => ({ source: "app", person: personId, model });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Each way a module can be unavailable, and the Matcher outcome it gives. */
const WAYS = [
  { name: "over budget", outcome: "budget", refuse: () => vi.stubEnv("AI_DAILY_BUDGET_USD", "0") },
  { name: "switched off", outcome: "off", refuse: (module: Parameters<typeof setModuleOn>[1]) => setModuleOn(db, module, false, pmId) },
] as const;

describe.each(WAYS)("$name", ({ outcome, refuse }) => {
  it("the Matcher is bypassed: the Request saves as a new Problem, escalated as Bypassed", async () => {
    refuse("matcher");
    const intake = createIntake({ db, matcher: createLlmMatcher(db, caller(customerId)), onMatcherFailure: "bypass" });
    const draft = { title: "Recipe book", description: "Keep my recipes in one place." };

    const proposal = await intake.propose(draft);
    expect(proposal).toMatchObject({
      match: null,
      matcherOutcome: outcome,
      newProblem: { title: "Recipe book", need: "Keep my recipes in one place." },
    });
    expect(model.calls).toHaveLength(0);

    // The client echoes the proposal back; the server derives the outcome from the AI call record.
    const { problemId: created, createdProblem } = intake.confirmFromClient(
      draft,
      { aiCallId: proposal.aiCallId },
      { createProblem: proposal.newProblem },
      customerId,
    );
    expect(createdProblem).toBe(true);
    expect(created).not.toBe(problemId);
    expect(db.select().from(matchingDecisions).get()).toMatchObject({
      matcherOutcome: outcome,
      submitterChoice: "no_match",
      escalationReasons: ["bypassed"],
      aiCallId: proposal.aiCallId,
    });
    expect(db.select().from(aiCalls).get()).toMatchObject({
      outcome: `refused_${outcome}`,
      relatedType: "request",
    });
  });

  it("the Evaluator leaves the Problem Not evaluated, with the reason", async () => {
    refuse("evaluator");
    expect(await tryEvaluateProblem(db, problemId, caller(pmId))).toBe(false);
    expect(model.calls).toHaveLength(0);
    expect(db.select().from(problems).get()).toMatchObject({ impactScore: null, evaluatedAt: null });
    const { refusal } = evaluationFreshness(db, problemId);
    expect(refusal).toBe(outcome);
    expect(notEvaluatedLabel(refusal!)).toBe(
      outcome === "budget" ? "Not evaluated (budget reached)" : "Not evaluated (Evaluator off)",
    );
  });

  it("the Brief writer refuses and stores no brief", async () => {
    refuse("brief");
    const thrown = await generateBrief(db, problemId, caller(pmId)).catch((error) => error);
    expect(thrown).toBeInstanceOf(AiRefusal);
    expect(thrown.reason).toBe(outcome);
    expect(getBrief(db, problemId)).toBeNull();
    expect(model.calls).toHaveLength(0);
  });

  it("the Decision note drafter refuses", async () => {
    refuse("decision_note");
    const thrown = await draftDecisionNote(db, problemId, "planned", caller(pmId)).catch((error) => error);
    expect(thrown).toBeInstanceOf(AiRefusal);
    expect(thrown.reason).toBe(outcome);
    expect(model.calls).toHaveLength(0);
  });
});

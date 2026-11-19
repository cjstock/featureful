import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db";
import { aiCalls, matchingDecisions, people, problems, requests, supports } from "@/db/schema";
import { offlineModel, promptVersion, type AiMeter, type AiModel } from "@/lib/ai";
import { createIntake, type Matcher, type MatchingExample } from "@/lib/intake";
import { createLlmMatcher } from "@/lib/intake/llm-matcher";
import { createMatchReview } from "@/lib/match-review";

function setup(matcher: Matcher, onMatcherFailure?: "throw" | "bypass") {
  const db = createDb(":memory:");
  const [alex] = db.insert(people).values({ name: "Alex", role: "customer" }).returning().all();
  const [grinder] = db
    .insert(problems)
    .values({
      title: "Dial in grind size",
      need: "I need to know which grind setting produced a brew I liked.",
    })
    .returning()
    .all();
  return { db, alex, grinder, intake: createIntake({ db, matcher, onMatcherFailure }) };
}

const NEW_PROBLEM = {
  title: "Compare roasts side by side",
  need: "I need to see how two roasts of the same bean differ.",
};

const matchProblem =
  (confidence = 0.9): Matcher =>
  async (_request, list) => ({
    match: { problemId: list[0].id, confidence, reason: "Same need: remembering grind." },
    newProblem: NEW_PROBLEM,
  });

const noMatch: Matcher = async () => ({ match: null, newProblem: NEW_PROBLEM });

const request = {
  title: "Save grinder clicks",
  description: "Let me write down the grinder clicks for each brew.",
};

function snapshot(db: Db) {
  return {
    problems: db.select().from(problems).all(),
    requests: db.select().from(requests).all(),
    supports: db.select().from(supports).all(),
  };
}

describe("Intake.propose", () => {
  it("returns the Matcher's match with the matched Problem's title and writes nothing", async () => {
    const { db, grinder, intake } = setup(matchProblem());
    const before = snapshot(db);

    const proposal = await intake.propose(request);

    expect(proposal.match).toEqual({
      problemId: grinder.id,
      problemTitle: "Dial in grind size",
      confidence: 0.9,
      reason: "Same need: remembering grind.",
    });
    expect(proposal.newProblem).toEqual(NEW_PROBLEM);
    expect(snapshot(db)).toEqual(before);
  });
});

describe("Intake.confirm", () => {
  it("accepting a match attaches the Request as Evidence and adds the submitter's Support", async () => {
    const { db, alex, grinder, intake } = setup(matchProblem());
    const proposal = await intake.propose(request);

    const result = intake.confirm(request, proposal, { attachTo: proposal.match!.problemId }, alex.id);

    expect(result).toMatchObject({ problemId: grinder.id, createdProblem: false });
    const after = snapshot(db);
    expect(after.problems).toHaveLength(1);
    expect(after.requests).toMatchObject([
      { problemId: grinder.id, authorId: alex.id, ...request },
    ]);
    expect(after.supports).toMatchObject([{ personId: alex.id, problemId: grinder.id }]);
  });

  it("rejecting a match (\"mine is different\") creates a new Problem from the AI-proposed statement", async () => {
    const { db, alex, grinder, intake } = setup(matchProblem());
    const proposal = await intake.propose(request);

    const result = intake.confirm(request, proposal, { createProblem: proposal.newProblem }, alex.id);

    expect(result.createdProblem).toBe(true);
    expect(result.problemId).not.toBe(grinder.id);
    const after = snapshot(db);
    expect(after.problems.find((p) => p.id === result.problemId)).toMatchObject({
      ...NEW_PROBLEM,
      status: "open",
    });
    expect(after.requests).toMatchObject([{ problemId: result.problemId, authorId: alex.id }]);
    expect(after.supports).toMatchObject([{ personId: alex.id, problemId: result.problemId }]);
  });

  it("with no match, confirming creates the proposed Problem with the Request as its Evidence", async () => {
    const { db, alex, intake } = setup(noMatch);
    const proposal = await intake.propose(request);
    expect(proposal.match).toBeNull();

    const result = intake.confirm(request, proposal, { createProblem: proposal.newProblem }, alex.id);

    const after = snapshot(db);
    expect(after.problems).toHaveLength(2);
    expect(after.problems.find((p) => p.id === result.problemId)).toMatchObject(NEW_PROBLEM);
    expect(after.requests).toMatchObject([{ problemId: result.problemId, ...request }]);
    expect(after.supports).toMatchObject([{ personId: alex.id, problemId: result.problemId }]);
  });

  it("a submitter who already supports the matched Problem adds Evidence without a second Support", async () => {
    const { db, alex, grinder, intake } = setup(matchProblem());
    db.insert(supports).values({ personId: alex.id, problemId: grinder.id }).run();

    const proposal = await intake.propose(request);
    intake.confirm(request, proposal, { attachTo: grinder.id }, alex.id);
    intake.confirm(
      { title: "Grind log", description: "Same again, different words." },
      proposal,
      { attachTo: grinder.id },
      alex.id,
    );

    const after = snapshot(db);
    expect(after.requests).toHaveLength(2);
    expect(after.supports).toHaveLength(1);
  });

  it("calls the evidence hook after saving, so evaluation can be triggered", async () => {
    const db = createDb(":memory:");
    const [alex] = db.insert(people).values({ name: "Alex", role: "customer" }).returning().all();
    const calls: unknown[] = [];
    const intake = createIntake({ db, matcher: noMatch, onEvidenceAdded: (c) => calls.push(c) });

    const result = intake.confirm(
      request,
      { match: null, newProblem: NEW_PROBLEM },
      { createProblem: NEW_PROBLEM },
      alex.id,
    );

    expect(calls).toEqual([result]);
  });
});

describe("Intake.confirm records a Matching decision", () => {
  const decisions = (db: Db) => db.select().from(matchingDecisions).all();

  it("match accepted: stores the proposal and choice 'accepted'", async () => {
    const { db, alex, grinder, intake } = setup(matchProblem(0.8));
    const proposal = await intake.propose(request);

    const { requestId } = intake.confirm(request, proposal, { attachTo: grinder.id }, alex.id);

    expect(decisions(db)).toMatchObject([
      {
        requestId,
        proposedProblemId: grinder.id,
        confidence: 0.8,
        reason: "Same need: remembering grind.",
        proposedTitle: NEW_PROBLEM.title,
        proposedNeed: NEW_PROBLEM.need,
        submitterChoice: "accepted",
        verdict: null,
        reviewerId: null,
        reviewedAt: null,
        note: null,
        fromProblemId: null,
        toProblemId: null,
      },
    ]);
  });

  it("match rejected (\"mine is different\"): keeps the rejected match and choice 'rejected'", async () => {
    const { db, alex, grinder, intake } = setup(matchProblem());
    const proposal = await intake.propose(request);

    const { requestId } = intake.confirm(
      request,
      proposal,
      { createProblem: proposal.newProblem },
      alex.id,
    );

    expect(decisions(db)).toMatchObject([
      {
        requestId,
        proposedProblemId: grinder.id,
        confidence: 0.9,
        submitterChoice: "rejected",
      },
    ]);
  });

  it("no match: stores the proposed new Problem and choice 'no_match'", async () => {
    const { db, alex, intake } = setup(noMatch);
    const proposal = await intake.propose(request);

    const { requestId } = intake.confirm(
      request,
      proposal,
      { createProblem: proposal.newProblem },
      alex.id,
    );

    expect(decisions(db)).toMatchObject([
      {
        requestId,
        proposedProblemId: null,
        confidence: null,
        reason: null,
        proposedTitle: NEW_PROBLEM.title,
        proposedNeed: NEW_PROBLEM.need,
        submitterChoice: "no_match",
      },
    ]);
  });
});

describe("Intake passes Matching examples to the Matcher", () => {
  afterEach(() => vi.useRealTimers());

  it("up to 20 informative reviewed decisions, corrections first, then most recently reviewed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let clock = Date.parse("2026-11-01T09:00:00Z");
    const tick = () => vi.setSystemTime((clock += 60_000));

    // Every accepted match is at low confidence, so each Confirm is an informative one.
    const { db, alex, grinder, intake } = setup(matchProblem(0.5));
    const [sam] = db.insert(people).values({ name: "Sam", role: "pm" }).returning().all();
    const review = createMatchReview({ db });
    const place = async (title: string) => {
      const draft = { title, description: `${title}.` };
      const { requestId } = intake.confirm(draft, await intake.propose(draft), { attachTo: grinder.id }, alex.id);
      return db.select().from(matchingDecisions).all().find((d) => d.requestId === requestId)!.id;
    };

    await place("Unreviewed"); // keeps the Problem alive and stays out of the examples
    // Reviewed in this order: a Split, then 25 Confirms, then a Move.
    const split = await place("Split me");
    tick();
    review.review(split, "split", { newProblem: NEW_PROBLEM, note: "Different need." }, sam.id);
    for (let i = 0; i < 25; i++) {
      const id = await place(`Confirm ${i}`);
      tick();
      review.review(id, "confirm", {}, sam.id);
    }
    const moved = await place("Move me");
    tick();
    review.review(moved, "move", { targetProblemId: (await setupTarget(db)).id, note: "Belongs there." }, sam.id);

    let seen: MatchingExample[] = [];
    const spy: Matcher = async (_r, _p, examples) => ((seen = examples), { match: null, newProblem: NEW_PROBLEM });
    await createIntake({ db, matcher: spy }).propose(request);

    expect(seen.map((e) => e.request.title)).toEqual([
      "Move me",
      "Split me",
      ...Array.from({ length: 18 }, (_, i) => `Confirm ${24 - i}`),
    ]);
    expect(seen[0].review).toMatchObject({ verdict: "move", note: "Belongs there." });
  });
});

function setupTarget(db: Db) {
  return db.insert(problems).values({ title: "Taste", need: "I need to taste." }).returning().get();
}

describe("Intake passes Problem summaries to the Matcher", () => {
  it("each Problem summary is the Problem's id, title and need, and nothing else", async () => {
    let seen: Parameters<Matcher>[1] = [];
    const spy: Matcher = async (_r, list) => ((seen = list), { match: null, newProblem: NEW_PROBLEM });
    const { db, grinder, intake } = setup(spy);
    const taste = setupTarget(db);

    await intake.propose(request);

    expect(seen).toEqual([
      { id: grinder.id, title: grinder.title, need: grinder.need },
      { id: taste.id, title: "Taste", need: "I need to taste." },
    ]);
  });
});

describe("the Matcher's AI call on the Matching decision", () => {
  const answer = (problemId: number | null) =>
    offlineModel(
      JSON.stringify({
        matchedProblemId: problemId,
        confidence: problemId ? 0.8 : 0,
        reason: "Same need: remembering grind.",
        newProblem: NEW_PROBLEM,
        closestProblem: null,
      }),
    );

  function setupLlm(problemId: (grinderId: number) => number | null) {
    const db = createDb(":memory:");
    const [alex, priya] = db
      .insert(people)
      .values([
        { name: "Alex", role: "customer" },
        { name: "Priya", role: "customer" },
      ])
      .returning()
      .all();
    const grinder = db
      .insert(problems)
      .values({ title: "Dial in grind size", need: "I need to know which grind setting produced a brew I liked." })
      .returning()
      .get();
    const intakeFor = (personId: number | null, source: "app" | "seed" = "app") =>
      createIntake({
        db,
        matcher: createLlmMatcher(db, { source, person: personId, model: answer(problemId(grinder.id)) }),
      });
    return { db, alex, priya, grinder, intakeFor };
  }

  it("records the prompt version and AI call id, and points the AI call at the saved Request", async () => {
    const { db, alex, grinder, intakeFor } = setupLlm((id) => id);
    const intake = intakeFor(alex.id);

    const proposal = await intake.propose(request);
    expect(proposal.aiCallId).toEqual(expect.any(Number));
    const { requestId } = intake.confirm(request, proposal, { attachTo: grinder.id }, alex.id);

    const call = db.select().from(aiCalls).get()!;
    expect(call).toMatchObject({
      module: "matcher",
      personId: alex.id,
      relatedType: "request",
      relatedId: requestId,
      shownProblems: [{ id: grinder.id, title: grinder.title, need: grinder.need }],
    });
    expect(db.select().from(matchingDecisions).get()).toMatchObject({
      aiCallId: call.id,
      promptVersion: call.promptVersion,
    });
    expect(call.promptVersion).toBe(promptVersion(call.system));

    // The PM's decision card reads the AI call line from the Match review queue.
    const [item] = createMatchReview({ db }).listQueue();
    expect(item.aiCall).toEqual({
      id: call.id,
      module: "matcher",
      promptVersion: call.promptVersion,
      costUsd: 0,
      latencyMs: expect.any(Number),
      outcome: "ok",
    });
  });

  it("links only this person's own unused app Matcher call for this same Request; otherwise saves the decision unlinked", async () => {
    const { db, alex, priya, intakeFor } = setupLlm(() => null);
    const decide = (personId: number, aiCallId: number | null | undefined, draft = request) => {
      const intake = intakeFor(personId);
      return intake.confirm(draft, { match: null, newProblem: NEW_PROBLEM, aiCallId }, { createProblem: NEW_PROBLEM }, personId);
    };
    const alexCall = (await intakeFor(alex.id).propose(request)).aiCallId!;
    const seedCall = (await intakeFor(null, "seed").propose(request)).aiCallId!;
    const otherRequestCall = (await intakeFor(alex.id).propose({ title: "Dark mode", description: "Please." })).aiCallId!;

    decide(priya.id, alexCall); // another person's call
    decide(alex.id, seedCall); // a seed call (no person, not the app)
    decide(alex.id, otherRequestCall); // made for a different Request
    decide(alex.id, 999); // doesn't exist
    decide(alex.id, alexCall); // the real one: linked
    decide(alex.id, alexCall); // already linked to a Request

    const decisions = db.select().from(matchingDecisions).orderBy(matchingDecisions.id).all();
    expect(decisions.map((d) => d.aiCallId)).toEqual([null, null, null, null, alexCall, null]);
    expect(decisions.map((d) => d.promptVersion !== null)).toEqual([false, false, false, false, true, false]);
    expect(db.select().from(requests).all()).toHaveLength(6);
  });

  it("records no AI call for a Matcher that isn't the AI (a fake), and still saves the decision", async () => {
    const { db, alex, intake } = setup(noMatch);
    const proposal = await intake.propose(request);
    intake.confirm(request, proposal, { createProblem: NEW_PROBLEM }, alex.id);
    expect(db.select().from(matchingDecisions).get()).toMatchObject({ aiCallId: null, promptVersion: null });
    expect(createMatchReview({ db }).listQueue()[0].aiCall).toBeNull();
  });
});

describe("Escalation at confirm time", () => {
  const decision = (db: Db) => db.select().from(matchingDecisions).get()!;

  it("stores the Escalation reasons with the decision", async () => {
    const { db, alex, intake } = setup(matchProblem(0.5));
    const proposal = await intake.propose(request);

    intake.confirm(request, proposal, { createProblem: proposal.newProblem }, alex.id);

    expect(decision(db)).toMatchObject({
      matcherOutcome: "ok",
      escalationReasons: ["mine_is_different", "low_confidence"],
    });
  });

  it("a new Problem proposed beside a close Problem keeps the closest Problem and is a near miss", async () => {
    const closeCall: Matcher = async (_r, list) => ({
      match: null,
      newProblem: NEW_PROBLEM,
      closestProblem: { problemId: list[0].id, confidence: 0.55 },
    });
    const { db, alex, grinder, intake } = setup(closeCall);
    const proposal = await intake.propose(request);
    expect(proposal.closestProblem).toEqual({ problemId: grinder.id, confidence: 0.55 });

    intake.confirm(request, proposal, { createProblem: proposal.newProblem }, alex.id);

    expect(decision(db)).toMatchObject({
      closestProblemId: grinder.id,
      closestConfidence: 0.55,
      escalationReasons: ["near_miss"],
    });
  });

  it("ignores a closest Problem the Matcher wasn't shown, or one given alongside a match", async () => {
    const unknown: Matcher = async () => ({
      match: null,
      newProblem: NEW_PROBLEM,
      closestProblem: { problemId: 999, confidence: 0.9 },
    });
    expect((await setup(unknown).intake.propose(request)).closestProblem).toBeNull();

    const both: Matcher = async (_r, list) => ({
      match: { problemId: list[0].id, confidence: 0.9, reason: "Same need." },
      newProblem: NEW_PROBLEM,
      closestProblem: { problemId: list[0].id, confidence: 0.9 },
    });
    expect((await setup(both).intake.propose(request)).closestProblem).toBeNull();
  });
});

describe("Intake when the Matcher fails", () => {
  const failing: Matcher = async () => {
    throw new Error("Anthropic is down");
  };

  it("by default (the eval, the seed) propose rethrows, so a run stops on a failed AI call", async () => {
    await expect(setup(failing).intake.propose(request)).rejects.toThrow("Anthropic is down");
  });

  it("in the app, propose still returns a new-Problem proposal from the Request itself, marked failed", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { intake } = setup(failing, "bypass");

    const proposal = await intake.propose(request);

    errors.mockRestore();
    expect(proposal).toEqual({
      match: null,
      newProblem: { title: request.title, need: request.description },
      closestProblem: null,
      aiCallId: null,
      matcherOutcome: "failed",
    });
  });

  it("the submitter can save it as a new Problem, escalated as Bypassed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, alex, intake } = setup(failing, "bypass");
    const proposal = await intake.propose(request);

    const result = intake.confirm(request, proposal, { createProblem: proposal.newProblem }, alex.id);

    vi.restoreAllMocks();
    expect(result.createdProblem).toBe(true);
    expect(db.select().from(problems).all().find((p) => p.id === result.problemId)).toMatchObject({
      title: request.title,
      need: request.description,
    });
    expect(db.select().from(matchingDecisions).get()).toMatchObject({
      submitterChoice: "no_match",
      matcherOutcome: "failed",
      escalationReasons: ["bypassed"],
    });
  });
});

describe("the LLM Matcher's closest Problem", () => {
  it("reports the closest existing Problem when it proposes a new one, and the decision is a near miss", async () => {
    const { db, alex, grinder } = setup(noMatch);
    const model = offlineModel(
      JSON.stringify({
        matchedProblemId: null,
        confidence: 0,
        reason: "Grind memory is a different need from grind advice.",
        newProblem: NEW_PROBLEM,
        closestProblem: { id: grinder.id, confidence: 0.6 },
      }),
    );
    const intake = createIntake({ db, matcher: createLlmMatcher(db, { source: "app", person: alex.id, model }) });

    const proposal = await intake.propose(request);
    expect(proposal).toMatchObject({ match: null, closestProblem: { problemId: grinder.id, confidence: 0.6 } });
    intake.confirm(request, proposal, { createProblem: proposal.newProblem }, alex.id);

    expect(db.select().from(matchingDecisions).get()).toMatchObject({
      closestProblemId: grinder.id,
      closestConfidence: 0.6,
      escalationReasons: ["near_miss"],
    });
    expect(db.select().from(aiCalls).get()!.system).toMatch(/closestProblem/);
  });
});

describe("confirmFromClient: Escalation comes from the AI call record, never the client's word", () => {
  type Answer = { matchedProblemId: number | null; confidence: number; closestProblem: { id: number; confidence: number } | null };

  function setupApp(answer: (ids: { grinder: number; taste: number }) => Answer, model?: AiModel, meter?: AiMeter) {
    const db = createDb(":memory:");
    const [alex] = db.insert(people).values({ name: "Alex", role: "customer" }).returning().all();
    const [grinder, taste] = db
      .insert(problems)
      .values([
        { title: "Dial in grind size", need: "I need to remember grind settings." },
        { title: "Taste", need: "I need to taste." },
      ])
      .returning()
      .all();
    const text = JSON.stringify({
      reason: "Offline answer.",
      newProblem: NEW_PROBLEM,
      ...answer({ grinder: grinder.id, taste: taste.id }),
    });
    const intake = createIntake({
      db,
      matcher: createLlmMatcher(db, { source: "app", person: alex.id, model: model ?? offlineModel(text), meter }),
      onMatcherFailure: "bypass",
    });
    const decision = () => db.select().from(matchingDecisions).get()!;
    return { db, alex, grinder, taste, intake, decision };
  }

  it("ignores a forged high confidence and a missing Matcher outcome", async () => {
    const { alex, grinder, intake, decision } = setupApp(({ grinder }) => ({
      matchedProblemId: grinder,
      confidence: 0.5,
      closestProblem: null,
    }));
    const proposal = await intake.propose(request);
    const tampered = { ...proposal, matcherOutcome: undefined, match: { ...proposal.match!, confidence: 0.99 } };

    intake.confirmFromClient(request, tampered, { attachTo: grinder.id }, alex.id);

    expect(decision()).toMatchObject({
      confidence: 0.5,
      matcherOutcome: "ok",
      submitterChoice: "accepted",
      escalationReasons: ["low_confidence"],
      aiCallId: proposal.aiCallId,
    });
  });

  it("a client that claims no match when the Matcher matched still counts as \"mine is different\"", async () => {
    const { alex, grinder, intake, decision } = setupApp(({ grinder }) => ({
      matchedProblemId: grinder,
      confidence: 0.9,
      closestProblem: null,
    }));
    const proposal = await intake.propose(request);

    intake.confirmFromClient(request, { ...proposal, match: null }, { createProblem: NEW_PROBLEM }, alex.id);

    expect(decision()).toMatchObject({
      proposedProblemId: grinder.id,
      confidence: 0.9,
      submitterChoice: "rejected",
      escalationReasons: ["mine_is_different"],
    });
  });

  it("drops a closest Problem the Matcher wasn't shown, whether the client forged it or the model named it", async () => {
    const forged = setupApp(() => ({ matchedProblemId: null, confidence: 0, closestProblem: null }));
    const proposal = await forged.intake.propose(request);
    forged.intake.confirmFromClient(
      request,
      { ...proposal, closestProblem: { problemId: forged.grinder.id, confidence: 0.9 } },
      { createProblem: NEW_PROBLEM },
      forged.alex.id,
    );
    expect(forged.decision()).toMatchObject({ closestProblemId: null, closestConfidence: null });
    expect(forged.decision().escalationReasons).not.toContain("near_miss");

    const unshown = setupApp(() => ({ matchedProblemId: null, confidence: 0, closestProblem: { id: 999, confidence: 0.9 } }));
    const p2 = await unshown.intake.propose(request);
    unshown.intake.confirmFromClient(request, p2, { createProblem: NEW_PROBLEM }, unshown.alex.id);
    expect(unshown.decision()).toMatchObject({ closestProblemId: null, closestConfidence: null });
    expect(unshown.decision().escalationReasons).not.toContain("near_miss");

    // A closest Problem it was shown is kept.
    const real = setupApp(({ taste }) => ({ matchedProblemId: null, confidence: 0, closestProblem: { id: taste, confidence: 0.5 } }));
    const p3 = await real.intake.propose(request);
    real.intake.confirmFromClient(request, { ...p3, closestProblem: null }, { createProblem: NEW_PROBLEM }, real.alex.id);
    expect(real.decision()).toMatchObject({ closestProblemId: real.taste.id, closestConfidence: 0.5, escalationReasons: ["near_miss"] });
  });

  it("with no AI call it can verify (none claimed, made up, or someone else's), the decision is Bypassed", async () => {
    const { db, alex, grinder, intake } = setupApp(({ grinder }) => ({
      matchedProblemId: grinder,
      confidence: 0.95,
      closestProblem: null,
    }));
    const [priya] = db.insert(people).values({ name: "Priya", role: "customer" }).returning().all();
    const proposal = await intake.propose(request);
    for (const claim of [{ ...proposal, aiCallId: undefined }, { ...proposal, aiCallId: null }, { ...proposal, aiCallId: 999 }]) {
      intake.confirmFromClient(request, claim, { attachTo: grinder.id }, alex.id);
    }
    intake.confirmFromClient(request, proposal, { attachTo: grinder.id }, priya.id);

    const decisions = db.select().from(matchingDecisions).orderBy(matchingDecisions.id).all();
    expect(decisions).toHaveLength(4);
    for (const d of decisions) {
      expect(d).toMatchObject({ matcherOutcome: "failed", confidence: null, aiCallId: null, submitterChoice: "no_match" });
      expect(d.escalationReasons).toEqual(["bypassed"]);
    }
  });

  it("a Matcher refused for budget is Bypassed with outcome budget, and its AI call is linked", async () => {
    const overBudget: AiMeter = {
      beforeCall() {
        throw new Error("Daily AI budget reached");
      },
      afterCall() {},
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, alex, intake, decision } = setupApp(
      () => ({ matchedProblemId: null, confidence: 0, closestProblem: null }),
      undefined,
      overBudget,
    );

    const proposal = await intake.propose(request);
    expect(proposal).toMatchObject({ match: null, matcherOutcome: "budget", aiCallId: expect.any(Number) });
    const { requestId } = intake.confirmFromClient(request, proposal, { createProblem: proposal.newProblem }, alex.id);

    errors.mockRestore();
    expect(decision()).toMatchObject({ matcherOutcome: "budget", aiCallId: proposal.aiCallId, escalationReasons: ["bypassed"] });
    expect(db.select().from(aiCalls).get()).toMatchObject({ outcome: "refused_budget", relatedId: requestId });
  });

  it("a Matcher call that errored is Bypassed with outcome failed", async () => {
    const down: AiModel = {
      ...offlineModel(""),
      async doGenerate() {
        throw new Error("Anthropic is down");
      },
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { alex, intake, decision } = setupApp(() => ({ matchedProblemId: null, confidence: 0, closestProblem: null }), down);

    const proposal = await intake.propose(request);
    intake.confirmFromClient(request, proposal, { createProblem: proposal.newProblem }, alex.id);

    errors.mockRestore();
    expect(proposal.matcherOutcome).toBe("failed");
    expect(decision()).toMatchObject({ matcherOutcome: "failed", aiCallId: proposal.aiCallId, escalationReasons: ["bypassed"] });
  });
});

describe("High-Demand merge counts the Problem's supporters including this merge", () => {
  it("escalates when the submitter's join brings the Problem to 5 supporters, not 4", async () => {
    const { db, alex, grinder, intake } = setup(matchProblem(0.9));
    const others = db
      .insert(people)
      .values([1, 2, 3, 4].map((i) => ({ name: `P${i}`, role: "customer" as const })))
      .returning()
      .all();
    const reasonsAfterJoin = async (supportersBefore: number, personId: number) => {
      db.delete(supports).run();
      db.insert(supports)
        .values(others.slice(0, supportersBefore).map((p) => ({ personId: p.id, problemId: grinder.id })))
        .run();
      const proposal = await intake.propose(request);
      const { requestId } = intake.confirm(request, proposal, { attachTo: grinder.id }, personId);
      return db.select().from(matchingDecisions).where(eq(matchingDecisions.requestId, requestId)).get()!.escalationReasons!;
    };

    expect(await reasonsAfterJoin(4, alex.id)).toContain("high_demand_merge"); // 4 + Alex = 5
    expect(await reasonsAfterJoin(3, alex.id)).not.toContain("high_demand_merge"); // 3 + Alex = 4
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db";
import { matchingDecisions, people, problems, requests, supports } from "@/db/schema";
import { createIntake, type Matcher, type MatchingExample } from "@/lib/intake";
import { createMatchReview } from "@/lib/match-review";

function setup(matcher: Matcher) {
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
  return { db, alex, grinder, intake: createIntake({ db, matcher }) };
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

  it("up to 20 reviewed decisions, corrections first, then most recently reviewed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let clock = Date.parse("2026-11-01T09:00:00Z");
    const tick = () => vi.setSystemTime((clock += 60_000));

    const { db, alex, grinder, intake } = setup(noMatch);
    const [sam] = db.insert(people).values({ name: "Sam", role: "pm" }).returning().all();
    const review = createMatchReview({ db, boundaryNoteWriter: async () => "" });
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

describe("Intake passes Boundary notes to the Matcher", () => {
  it("each Problem summary carries its Boundary note, or null when it has none", async () => {
    let seen: Parameters<Matcher>[1] = [];
    const spy: Matcher = async (_r, list) => ((seen = list), { match: null, newProblem: NEW_PROBLEM });
    const { db, grinder, intake } = setup(spy);
    const note = "Includes remembering grind settings. Does not include grinder maintenance.";
    db.update(problems).set({ boundaryNote: note }).where(eq(problems.id, grinder.id)).run();
    const taste = setupTarget(db);

    await intake.propose(request);

    expect(seen).toEqual([
      { id: grinder.id, title: grinder.title, need: grinder.need, boundaryNote: note },
      { id: taste.id, title: "Taste", need: "I need to taste.", boundaryNote: null },
    ]);
  });
});

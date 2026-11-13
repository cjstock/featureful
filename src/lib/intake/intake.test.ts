import { describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db";
import { people, problems, requests, supports } from "@/db/schema";
import { createIntake, type Matcher } from "@/lib/intake";

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

    const result = intake.confirm(
      request,
      { attachTo: proposal.match!.problemId },
      alex.id,
    );

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

    const result = intake.confirm(request, { createProblem: proposal.newProblem }, alex.id);

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

    const result = intake.confirm(request, { createProblem: proposal.newProblem }, alex.id);

    const after = snapshot(db);
    expect(after.problems).toHaveLength(2);
    expect(after.problems.find((p) => p.id === result.problemId)).toMatchObject(NEW_PROBLEM);
    expect(after.requests).toMatchObject([{ problemId: result.problemId, ...request }]);
    expect(after.supports).toMatchObject([{ personId: alex.id, problemId: result.problemId }]);
  });

  it("a submitter who already supports the matched Problem adds Evidence without a second Support", async () => {
    const { db, alex, grinder, intake } = setup(matchProblem());
    db.insert(supports).values({ personId: alex.id, problemId: grinder.id }).run();

    intake.confirm(request, { attachTo: grinder.id }, alex.id);
    intake.confirm(
      { title: "Grind log", description: "Same again, different words." },
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

    const result = intake.confirm(request, { createProblem: NEW_PROBLEM }, alex.id);

    expect(calls).toEqual([result]);
  });
});

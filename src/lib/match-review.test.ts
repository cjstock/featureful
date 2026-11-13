import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db";
import { matchingDecisions, people, problems, requests, supports } from "@/db/schema";
import { createIntake, type Matcher } from "@/lib/intake";
import { createMatchReview, type BoundaryNoteInput, type BoundaryNoteWriter } from "@/lib/match-review";
import { getProblem } from "@/lib/problems";

/** Fake AI dependency: returns the current note unchanged. */
const fakeWriter: BoundaryNoteWriter = async ({ currentNote }) => currentNote ?? "";

const NEW_PROBLEM = { title: "Log cupping sessions", need: "I need to record how a coffee tasted." };

/** Matches the first Problem when there is one, with a fixed confidence and reason. */
const matchFirst: Matcher = async (_request, list) => ({
  match: list[0] ? { problemId: list[0].id, confidence: 0.7, reason: "Both about taste." } : null,
  newProblem: NEW_PROBLEM,
});

function setup() {
  const db = createDb(":memory:");
  const [alex, sam] = db
    .insert(people)
    .values([
      { name: "Alex", role: "customer" },
      { name: "Sam", role: "pm" },
    ])
    .returning()
    .all();
  const [flavour] = db
    .insert(problems)
    .values({ title: "Compare roast flavour", need: "I need to compare how roasts taste." })
    .returning()
    .all();
  const intake = createIntake({ db, matcher: matchFirst });

  /** Submit a Request through Intake; `accept` follows the proposed match, else "mine is different". */
  async function submit(title: string, accept: boolean) {
    const draft = { title, description: `${title}, please.` };
    const proposal = await intake.propose(draft);
    const decision =
      accept && proposal.match
        ? { attachTo: proposal.match.problemId }
        : { createProblem: proposal.newProblem };
    return intake.confirm(draft, proposal, decision, alex.id);
  }

  return { db, alex, sam, flavour, submit, review: createMatchReview({ db, boundaryNoteWriter: fakeWriter }) };
}

describe("Match review queue", () => {
  it("listQueue shows unreviewed Matching decisions newest first, with everything needed to judge them", async () => {
    const { alex, flavour, submit, review } = setup();
    const first = await submit("Cupping notes", true);
    const second = await submit("Tasting journal", false);

    const queue = review.listQueue();

    expect(queue.map((d) => d.request.id)).toEqual([second.requestId, first.requestId]);
    expect(queue[0]).toMatchObject({
      request: { id: second.requestId, title: "Tasting journal", description: "Tasting journal, please." },
      submitter: { id: alex.id, name: "Alex" },
      proposal: {
        match: {
          problemId: flavour.id,
          problemTitle: "Compare roast flavour",
          confidence: 0.7,
          reason: "Both about taste.",
        },
        newProblem: NEW_PROBLEM,
      },
      submitterChoice: "rejected",
      currentProblem: { id: second.problemId, title: NEW_PROBLEM.title },
      review: null,
    });
    expect(queue[1]).toMatchObject({
      submitterChoice: "accepted",
      currentProblem: { id: flavour.id, title: "Compare roast flavour" },
    });
    expect(review.countQueue()).toBe(2);
  });

  it("a reviewed decision leaves the queue and appears in listReviewed with its verdict and note", async () => {
    const { db, sam, flavour, submit, review } = setup();
    const kept = await submit("Cupping notes", true);
    const reviewed = await submit("Tasting journal", false);
    // Review actions arrive in a later ticket; record a Move by hand.
    const reviewedAt = new Date("2026-11-01T10:00:00Z");
    db.update(matchingDecisions)
      .set({
        verdict: "move",
        reviewerId: sam.id,
        reviewedAt,
        note: "Tasting is flavour comparison.",
        fromProblemId: reviewed.problemId,
        toProblemId: flavour.id,
      })
      .where(eq(matchingDecisions.requestId, reviewed.requestId))
      .run();

    expect(review.listQueue().map((d) => d.request.id)).toEqual([kept.requestId]);
    expect(review.countQueue()).toBe(1);
    expect(review.listReviewed()).toMatchObject([
      {
        request: { id: reviewed.requestId },
        review: {
          verdict: "move",
          note: "Tasting is flavour comparison.",
          reviewer: { id: sam.id, name: "Sam" },
          reviewedAt,
          fromProblem: { id: reviewed.problemId, title: NEW_PROBLEM.title },
          toProblem: { id: flavour.id, title: "Compare roast flavour" },
        },
      },
    ]);
  });

  it("a no-match decision has no proposed match, only the proposed new Problem", async () => {
    const db = createDb(":memory:");
    const [alex] = db.insert(people).values({ name: "Alex", role: "customer" }).returning().all();
    const intake = createIntake({ db, matcher: matchFirst });
    const draft = { title: "Cupping notes", description: "Record cupping." };
    const proposal = await intake.propose(draft);
    intake.confirm(draft, proposal, { createProblem: proposal.newProblem }, alex.id);

    expect(createMatchReview({ db, boundaryNoteWriter: fakeWriter }).listQueue()).toMatchObject([
      { proposal: { match: null, newProblem: NEW_PROBLEM }, submitterChoice: "no_match" },
    ]);
  });
});

/** Proposes no match; each test's `place` decides where the Request goes. */
const noMatch: Matcher = async () => ({ match: null, newProblem: NEW_PROBLEM });

function setupReview(boundaryNoteWriter: BoundaryNoteWriter = fakeWriter) {
  const db = createDb(":memory:");
  const [alex, priya, sam] = db
    .insert(people)
    .values([
      { name: "Alex", role: "customer" },
      { name: "Priya", role: "customer" },
      { name: "Sam", role: "pm" },
    ])
    .returning()
    .all();
  const [flavour, grind] = db
    .insert(problems)
    .values([
      { title: "Compare roast flavour", need: "I need to compare how roasts taste." },
      { title: "Dial in grind size", need: "I need to remember grind settings." },
    ])
    .returning()
    .all();
  const intake = createIntake({ db, matcher: noMatch });
  const review = createMatchReview({ db, boundaryNoteWriter });

  /** Submit a Request through Intake onto `problemId`; returns its Matching decision. */
  async function place(personId: number, problemId: number, title = "Cupping log") {
    const draft = { title, description: `${title}, please.` };
    const proposal = await intake.propose(draft);
    const { requestId } = intake.confirm(draft, proposal, { attachTo: problemId }, personId);
    return db.select().from(matchingDecisions).where(eq(matchingDecisions.requestId, requestId)).get()!;
  }

  return { db, alex, priya, sam, flavour, grind, review, place };
}

const requestsOf = (db: Db) => db.select().from(requests).all();
const supportsOf = (db: Db) =>
  db.select({ personId: supports.personId, problemId: supports.problemId }).from(supports).all();
const problemOf = (db: Db, requestId: number) =>
  db.select().from(requests).where(eq(requests.id, requestId)).get()!.problemId;

describe("Match review: Confirm", () => {
  it("records the verdict, note, and reviewer and moves nothing", async () => {
    const { db, alex, sam, flavour, review, place } = setupReview();
    const decision = await place(alex.id, flavour.id);
    const before = { requests: requestsOf(db), supports: supportsOf(db) };

    const affected = review.review(decision.id, "confirm", { note: "Right call." }, sam.id);

    expect(affected).toEqual([flavour.id]);
    expect({ requests: requestsOf(db), supports: supportsOf(db) }).toEqual(before);
    const [item] = review.listReviewed();
    expect(item.review).toMatchObject({
      verdict: "confirm",
      note: "Right call.",
      reviewer: { id: sam.id, name: "Sam" },
      fromProblem: null,
      toProblem: null,
    });
    expect(item.review!.reviewedAt).toBeInstanceOf(Date);
  });

  it("stores a blank note as no note", async () => {
    const { alex, sam, flavour, review, place } = setupReview();
    const decision = await place(alex.id, flavour.id);

    review.review(decision.id, "confirm", { note: "   " }, sam.id);

    expect(review.listReviewed()[0].review!.note).toBeNull();
  });
});

describe("Match review: Move", () => {
  it("relocates the Request and the submitter's Support to the target Problem", async () => {
    const { db, alex, priya, sam, flavour, grind, review, place } = setupReview();
    const decision = await place(alex.id, grind.id);
    await place(priya.id, grind.id, "Grind notes"); // keeps the source alive

    const affected = review.review(
      decision.id,
      "move",
      { targetProblemId: flavour.id, note: "Cupping is about flavour." },
      sam.id,
    );

    expect(affected).toEqual([grind.id, flavour.id]);
    expect(problemOf(db, decision.requestId)).toBe(flavour.id);
    expect(supportsOf(db)).toEqual(
      expect.arrayContaining([
        { personId: alex.id, problemId: flavour.id },
        { personId: priya.id, problemId: grind.id },
      ]),
    );
    expect(supportsOf(db)).not.toContainEqual({ personId: alex.id, problemId: grind.id });
    expect(review.listReviewed()[0].review).toMatchObject({
      verdict: "move",
      note: "Cupping is about flavour.",
      fromProblem: { id: grind.id, title: grind.title },
      toProblem: { id: flavour.id, title: flavour.title },
    });
  });

  it("keeps the submitter's Support on the source when they have another Request there", async () => {
    const { db, alex, sam, flavour, grind, review, place } = setupReview();
    const decision = await place(alex.id, grind.id);
    await place(alex.id, grind.id, "Grind notes");

    review.review(decision.id, "move", { targetProblemId: flavour.id }, sam.id);

    expect(supportsOf(db)).toEqual(
      expect.arrayContaining([
        { personId: alex.id, problemId: grind.id },
        { personId: alex.id, problemId: flavour.id },
      ]),
    );
  });

  it("does not duplicate a Support the submitter already gives the target", async () => {
    const { db, alex, sam, flavour, grind, review, place } = setupReview();
    const decision = await place(alex.id, grind.id);
    await place(alex.id, flavour.id, "Flavour notes");

    review.review(decision.id, "move", { targetProblemId: flavour.id }, sam.id);

    expect(supportsOf(db)).toEqual([{ personId: alex.id, problemId: flavour.id }]);
  });
});

describe("Match review: Split", () => {
  it("creates a Problem from the given title and need and relocates the Request and Support", async () => {
    const { db, alex, priya, sam, flavour, review, place } = setupReview();
    const decision = await place(alex.id, flavour.id);
    await place(priya.id, flavour.id, "Flavour wheel");
    const newProblem = { title: "Score cupping sessions", need: "I need to score cuppings." };

    const affected = review.review(decision.id, "split", { newProblem }, sam.id);

    const created = db.select().from(problems).where(eq(problems.title, newProblem.title)).get();
    expect(created).toMatchObject({ ...newProblem, status: "open" });
    expect(affected).toEqual([flavour.id, created!.id]);
    expect(problemOf(db, decision.requestId)).toBe(created!.id);
    expect(supportsOf(db)).toEqual(
      expect.arrayContaining([
        { personId: alex.id, problemId: created!.id },
        { personId: priya.id, problemId: flavour.id },
      ]),
    );
    expect(supportsOf(db)).not.toContainEqual({ personId: alex.id, problemId: flavour.id });
    expect(review.listReviewed()[0].review).toMatchObject({
      verdict: "split",
      fromProblem: { id: flavour.id },
      toProblem: { id: created!.id, title: newProblem.title },
    });
  });

  it("refuses a Split without a new Problem", async () => {
    const { alex, sam, flavour, review, place } = setupReview();
    const decision = await place(alex.id, flavour.id);

    expect(() => review.review(decision.id, "split", {}, sam.id)).toThrow();
    expect(review.countQueue()).toBe(1);
  });
});

describe("Match review: a source left without Evidence", () => {
  it("is deleted with its Supports, nulls proposals pointing to it, and is not returned", async () => {
    const { db, alex, priya, sam, flavour, grind, review, place } = setupReview();
    const decision = await place(alex.id, grind.id);
    // Priya supports the source without Evidence of her own.
    db.insert(supports).values({ personId: priya.id, problemId: grind.id }).run();
    // Another decision whose Matcher proposal pointed at the source.
    const other = await place(priya.id, flavour.id, "Taste notes");
    db.update(matchingDecisions)
      .set({ proposedProblemId: grind.id, confidence: 0.6, reason: "Looked similar." })
      .where(eq(matchingDecisions.id, other.id))
      .run();

    const affected = review.review(decision.id, "move", { targetProblemId: flavour.id }, sam.id);

    expect(affected).toEqual([flavour.id]);
    expect(db.select().from(problems).where(eq(problems.id, grind.id)).get()).toBeUndefined();
    expect(supportsOf(db).filter((s) => s.problemId === grind.id)).toEqual([]);
    expect(problemOf(db, decision.requestId)).toBe(flavour.id);
    const otherItem = review.listQueue().find((i) => i.id === other.id)!;
    expect(otherItem.proposal.match).toMatchObject({ problemId: null, problemTitle: null });
    expect(review.listReviewed()[0].review).toMatchObject({
      verdict: "move",
      fromProblem: null,
      toProblem: { id: flavour.id },
    });
  });
});

describe("Match review: refusals", () => {
  it("refuses to review a decision twice", async () => {
    const { alex, sam, flavour, grind, review, place } = setupReview();
    const decision = await place(alex.id, flavour.id);
    review.review(decision.id, "confirm", {}, sam.id);

    expect(() =>
      review.review(decision.id, "move", { targetProblemId: grind.id }, sam.id),
    ).toThrow(/already been reviewed/);
    expect(review.listReviewed()[0].review!.verdict).toBe("confirm");
  });

  it("refuses to move a Request onto the Problem it is already on", async () => {
    const { db, alex, sam, flavour, review, place } = setupReview();
    const decision = await place(alex.id, flavour.id);
    const before = requestsOf(db);

    expect(() =>
      review.review(decision.id, "move", { targetProblemId: flavour.id }, sam.id),
    ).toThrow(/already on/);
    expect(requestsOf(db)).toEqual(before);
    expect(review.countQueue()).toBe(1);
  });

  it("refuses to move to a Problem that does not exist, changing nothing", async () => {
    const { db, alex, sam, flavour, review, place } = setupReview();
    const decision = await place(alex.id, flavour.id);
    const before = { requests: requestsOf(db), supports: supportsOf(db) };

    expect(() => review.review(decision.id, "move", { targetProblemId: 999 }, sam.id)).toThrow();
    expect({ requests: requestsOf(db), supports: supportsOf(db) }).toEqual(before);
    expect(review.countQueue()).toBe(1);
  });
});

/** Fake BoundaryNoteWriter that records its inputs and writes a note naming the Problem. */
function recordingWriter() {
  const calls: BoundaryNoteInput[] = [];
  const writer: BoundaryNoteWriter = async (input) => {
    calls.push(input);
    return `Includes what fits ${input.problem.title}.`;
  };
  return { calls, writer };
}

const noteOf = (db: Db, problemId: number) => getProblem(db, problemId)?.problem.boundaryNote;

describe("Match review: Boundary note distillation", () => {
  it("after a Move, revises the note of the source and destination from the review", async () => {
    const { calls, writer } = recordingWriter();
    const { db, alex, priya, sam, flavour, grind, review, place } = setupReview(writer);
    db.update(problems).set({ boundaryNote: "Includes grind settings." }).where(eq(problems.id, grind.id)).run();
    const decision = await place(alex.id, grind.id);
    await place(priya.id, grind.id, "Grind notes"); // keeps the source alive
    review.review(decision.id, "move", { targetProblemId: flavour.id, note: "Cupping is flavour." }, sam.id);

    await review.distilBoundaryNotes(decision.id);

    expect(calls).toEqual([
      {
        problem: { id: grind.id, title: grind.title, need: grind.need },
        currentNote: "Includes grind settings.",
        review: {
          request: { title: "Cupping log", description: "Cupping log, please." },
          verdict: "move",
          fromProblem: { id: grind.id, title: grind.title },
          toProblem: { id: flavour.id, title: flavour.title },
          note: "Cupping is flavour.",
        },
      },
      expect.objectContaining({ problem: expect.objectContaining({ id: flavour.id }), currentNote: null }),
    ]);
    expect(noteOf(db, grind.id)).toBe("Includes what fits Dial in grind size.");
    expect(noteOf(db, flavour.id)).toBe("Includes what fits Compare roast flavour.");
  });

  it("Confirm without a note makes no call; Confirm with a note revises the Request's Problem", async () => {
    const { calls, writer } = recordingWriter();
    const { db, alex, sam, grind, review, place } = setupReview(writer);
    const silent = await place(alex.id, grind.id);
    const noted = await place(alex.id, grind.id, "Grind notes");
    review.review(silent.id, "confirm", {}, sam.id);
    review.review(noted.id, "confirm", { note: "Grind memory, not grinder care." }, sam.id);

    await review.distilBoundaryNotes(silent.id);
    expect(calls).toEqual([]);

    await review.distilBoundaryNotes(noted.id);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      problem: { id: grind.id },
      review: { verdict: "confirm", note: "Grind memory, not grinder care." },
    });
    expect(noteOf(db, grind.id)).toBe("Includes what fits Dial in grind size.");
  });

  it("skips a source deleted by the review and distils only the destination", async () => {
    const { calls, writer } = recordingWriter();
    const { alex, sam, flavour, grind, review, place } = setupReview(writer);
    const decision = await place(alex.id, grind.id);
    review.review(decision.id, "move", { targetProblemId: flavour.id }, sam.id);

    await review.distilBoundaryNotes(decision.id);

    expect(calls.map((c) => c.problem.id)).toEqual([flavour.id]);
    expect(calls[0].review).toMatchObject({ fromProblem: null, toProblem: { title: flavour.title } });
  });

  it("a failed call keeps that Problem's existing note, still revises the others, and keeps the review", async () => {
    const writer: BoundaryNoteWriter = async ({ problem }) => {
      if (problem.title === "Dial in grind size") throw new Error("AI down");
      return "Includes flavour.";
    };
    const { db, alex, priya, sam, flavour, grind, review, place } = setupReview(writer);
    db.update(problems).set({ boundaryNote: "Includes grind settings." }).where(eq(problems.id, grind.id)).run();
    const decision = await place(alex.id, grind.id);
    await place(priya.id, grind.id, "Grind notes");
    review.review(decision.id, "move", { targetProblemId: flavour.id }, sam.id);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(review.distilBoundaryNotes(decision.id)).resolves.toBeUndefined();

    errors.mockRestore();
    expect(noteOf(db, grind.id)).toBe("Includes grind settings.");
    expect(noteOf(db, flavour.id)).toBe("Includes flavour.");
    expect(review.listReviewed()[0].review).toMatchObject({ verdict: "move" });
  });
});

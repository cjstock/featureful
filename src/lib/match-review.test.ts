import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db";
import { matchingDecisions, people, problems, requests, supports } from "@/db/schema";
import { createIntake, type Matcher } from "@/lib/intake";
import type { EscalationReason } from "@/db/schema";
import { createMatchReview, listMatchingExamples } from "@/lib/match-review";

/** A Move or Split note (required). */
const NOTE = "Different underlying need.";

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

  return { db, alex, sam, flavour, submit, review: createMatchReview({ db }) };
}

describe("Match review queue", () => {
  it("listQueue shows each escalated decision with everything needed to judge it and its reasons", async () => {
    const { alex, flavour, submit, review } = setup();
    const first = await submit("Cupping notes", true);
    const second = await submit("Tasting journal", false);

    const queue = review.listQueue();

    // Mine is different outranks low confidence.
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
        closestProblem: null,
      },
      submitterChoice: "rejected",
      matcherOutcome: "ok",
      escalationReasons: ["mine_is_different", "low_confidence"],
      currentProblem: { id: second.problemId, title: NEW_PROBLEM.title },
      review: null,
    });
    expect(queue[1]).toMatchObject({
      submitterChoice: "accepted",
      escalationReasons: ["low_confidence"],
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

    const all = [
      ...createMatchReview({ db }).listQueue(),
      ...createMatchReview({ db }).listNotEscalated(),
    ];
    expect(all).toMatchObject([
      { proposal: { match: null, newProblem: NEW_PROBLEM }, submitterChoice: "no_match" },
    ]);
  });
});

/** Proposes no match; each test's `place` decides where the Request goes. */
const noMatch: Matcher = async () => ({ match: null, newProblem: NEW_PROBLEM });

function setupReview() {
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
  const review = createMatchReview({ db });

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

    review.review(decision.id, "move", { targetProblemId: flavour.id, note: NOTE }, sam.id);

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

    review.review(decision.id, "move", { targetProblemId: flavour.id, note: NOTE }, sam.id);

    expect(supportsOf(db)).toEqual([{ personId: alex.id, problemId: flavour.id }]);
  });
});

describe("Match review: Split", () => {
  it("creates a Problem from the given title and need and relocates the Request and Support", async () => {
    const { db, alex, priya, sam, flavour, review, place } = setupReview();
    const decision = await place(alex.id, flavour.id);
    await place(priya.id, flavour.id, "Flavour wheel");
    const newProblem = { title: "Score cupping sessions", need: "I need to score cuppings." };

    const affected = review.review(decision.id, "split", { newProblem, note: NOTE }, sam.id);

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

    expect(() => review.review(decision.id, "split", { note: NOTE }, sam.id)).toThrow();
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

    const affected = review.review(decision.id, "move", { targetProblemId: flavour.id, note: NOTE }, sam.id);

    expect(affected).toEqual([flavour.id]);
    expect(db.select().from(problems).where(eq(problems.id, grind.id)).get()).toBeUndefined();
    expect(supportsOf(db).filter((s) => s.problemId === grind.id)).toEqual([]);
    expect(problemOf(db, decision.requestId)).toBe(flavour.id);
    const otherItem = [...review.listQueue(), ...review.listNotEscalated()].find((i) => i.id === other.id)!;
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
      review.review(decision.id, "move", { targetProblemId: grind.id, note: NOTE }, sam.id),
    ).toThrow(/already been reviewed/);
    expect(review.listReviewed()[0].review!.verdict).toBe("confirm");
  });

  it("refuses to move a Request onto the Problem it is already on", async () => {
    const { db, alex, sam, flavour, review, place } = setupReview();
    const decision = await place(alex.id, flavour.id);
    const before = requestsOf(db);

    expect(() =>
      review.review(decision.id, "move", { targetProblemId: flavour.id, note: NOTE }, sam.id),
    ).toThrow(/already on/);
    expect(requestsOf(db)).toEqual(before);
    expect(review.countQueue()).toBe(1);
  });

  it("refuses to move to a Problem that does not exist, changing nothing", async () => {
    const { db, alex, sam, flavour, review, place } = setupReview();
    const decision = await place(alex.id, flavour.id);
    const before = { requests: requestsOf(db), supports: supportsOf(db) };

    expect(() => review.review(decision.id, "move", { targetProblemId: 999, note: NOTE }, sam.id)).toThrow();
    expect({ requests: requestsOf(db), supports: supportsOf(db) }).toEqual(before);
    expect(review.countQueue()).toBe(1);
  });
});

/** Give a decision these Escalation reasons (test setup: reason computation is tested in escalation.test.ts). */
const escalate = (db: Db, id: number, reasons: EscalationReason[]) =>
  db.update(matchingDecisions).set({ escalationReasons: reasons }).where(eq(matchingDecisions.id, id)).run();

describe("Escalation queue", () => {
  it("lists escalated, unreviewed decisions by strongest reason, then oldest first; the rest are Not escalated", async () => {
    const { db, alex, flavour, review, place } = setupReview();
    const given: [string, EscalationReason[]][] = [
      ["spot", ["spot_check"]],
      ["near", ["near_miss"]],
      ["low (older)", ["low_confidence"]],
      ["bypassed", ["bypassed"]],
      ["different", ["mine_is_different", "low_confidence"]],
      ["auto (older)", []],
      ["low (newer)", ["low_confidence"]],
      ["demand", ["high_demand_merge"]],
      ["auto (newer)", []],
      ["reviewed", ["bypassed"]],
    ];
    const ids = new Map<string, number>();
    for (const [title, reasons] of given) {
      const d = await place(alex.id, flavour.id, title);
      escalate(db, d.id, reasons);
      ids.set(title, d.id);
    }
    review.review(ids.get("reviewed")!, "confirm", {}, alex.id);

    expect(review.listQueue().map((d) => d.request.title)).toEqual([
      "bypassed",
      "different",
      "demand",
      "low (older)",
      "low (newer)",
      "near",
      "spot",
    ]);
    expect(review.listQueue()[1].escalationReasons).toEqual(["mine_is_different", "low_confidence"]);
    expect(review.countQueue()).toBe(7);
    // Auto-accepted decisions, newest first, still reviewable.
    expect(review.listNotEscalated().map((d) => d.request.title)).toEqual(["auto (newer)", "auto (older)"]);
    review.review(ids.get("auto (older)")!, "confirm", {}, alex.id);
    expect(review.listNotEscalated().map((d) => d.request.title)).toEqual(["auto (newer)"]);
  });
});

describe("Match review: notes and Regression cases", () => {
  it("refuses a Move or Split without a note, changing nothing; Confirm's note stays optional", async () => {
    const { db, alex, sam, flavour, grind, review, place } = setupReview();
    const decision = await place(alex.id, flavour.id);
    const before = { requests: requestsOf(db), supports: supportsOf(db) };

    for (const note of [undefined, null, "  "]) {
      expect(() => review.review(decision.id, "move", { targetProblemId: grind.id, note }, sam.id)).toThrow(
        /What makes these different needs/,
      );
      expect(() => review.review(decision.id, "split", { newProblem: NEW_PROBLEM, note }, sam.id)).toThrow(
        /What makes these different needs/,
      );
    }
    expect({ requests: requestsOf(db), supports: supportsOf(db) }).toEqual(before);
    expect(review.review(decision.id, "confirm", {}, sam.id)).toEqual([flavour.id]);
  });

  it("marks a Move or Split as a Regression case by default, unless the PM unticks it; a Confirm is not one by default", async () => {
    const { db, alex, priya, sam, flavour, grind, review, place } = setupReview();
    const moved = await place(alex.id, grind.id, "Moved");
    const split = await place(alex.id, grind.id, "Split");
    const unmarked = await place(priya.id, grind.id, "Unmarked");
    const confirmed = await place(priya.id, flavour.id, "Confirmed");

    review.review(moved.id, "move", { targetProblemId: flavour.id, note: NOTE }, sam.id);
    review.review(split.id, "split", { newProblem: NEW_PROBLEM, note: NOTE }, sam.id);
    review.review(unmarked.id, "move", { targetProblemId: flavour.id, note: NOTE, regressionCase: false }, sam.id);
    review.review(confirmed.id, "confirm", {}, sam.id);

    const marks = Object.fromEntries(review.listReviewed().map((d) => [d.request.title, d.regressionCase]));
    expect(marks).toEqual({ Moved: true, Split: true, Unmarked: false, Confirmed: false });
    expect(db.select().from(matchingDecisions).where(eq(matchingDecisions.id, moved.id)).get()).toMatchObject({
      regressionCase: true,
    });
  });
});

describe("Matching examples", () => {
  it("keep every correction, but a Confirm only when it was escalated for an ambiguity reason", async () => {
    const { db, alex, sam, flavour, grind, review, place } = setupReview();
    const given: [string, EscalationReason[], "confirm" | "move"][] = [
      ["moved, auto-accepted", [], "move"],
      ["confirmed, auto-accepted", [], "confirm"],
      ["confirmed, spot check", ["spot_check"], "confirm"],
      ["confirmed, high-Demand", ["high_demand_merge"], "confirm"],
      ["confirmed, bypassed", ["bypassed"], "confirm"],
      ["confirmed, mine is different", ["mine_is_different"], "confirm"],
      ["confirmed, low confidence", ["high_demand_merge", "low_confidence"], "confirm"],
      ["confirmed, near miss", ["near_miss"], "confirm"],
    ];
    await place(alex.id, grind.id, "keeps grind alive");
    for (const [title, reasons, verdict] of given) {
      const d = await place(alex.id, grind.id, title);
      escalate(db, d.id, reasons);
      review.review(
        d.id,
        verdict,
        verdict === "move" ? { targetProblemId: flavour.id, note: NOTE } : {},
        sam.id,
      );
    }

    expect(new Set(listMatchingExamples(db).map((e) => e.request.title))).toEqual(
      new Set([
        "moved, auto-accepted",
        "confirmed, mine is different",
        "confirmed, low confidence",
        "confirmed, near miss",
      ]),
    );
  });
});

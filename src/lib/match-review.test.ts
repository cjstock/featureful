import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb } from "@/db";
import { matchingDecisions, people, problems } from "@/db/schema";
import { createIntake, type Matcher } from "@/lib/intake";
import { createMatchReview } from "@/lib/match-review";

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

    expect(createMatchReview({ db }).listQueue()).toMatchObject([
      { proposal: { match: null, newProblem: NEW_PROBLEM }, submitterChoice: "no_match" },
    ]);
  });
});

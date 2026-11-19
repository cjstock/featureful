import { describe, expect, it } from "vitest";
import { createDb } from "@/db";
import { people, problems, requests, supports } from "@/db/schema";
import { createIntake, type Matcher } from "@/lib/intake";
import { createMatchReview } from "@/lib/match-review";
import { loadInbox } from "@/lib/review-inbox-data";

const NEW_PROBLEM = { title: "Log cupping sessions", need: "I need to record how a coffee tasted." };

/** Matches the first Problem with low confidence: every accepted match is escalated. */
const matchFirst: Matcher = async (_request, list) => ({
  match: list[0] ? { problemId: list[0].id, confidence: 0.6, reason: "Both about taste." } : null,
  newProblem: NEW_PROBLEM,
});

function setup() {
  const db = createDb(":memory:");
  const authors = db
    .insert(people)
    .values(["Alex", "Bo", "Cy", "Di", "Ed"].map((name) => ({ name, role: "customer" as const })))
    .returning()
    .all();
  const [flavour] = db
    .insert(problems)
    .values({ title: "Compare roast flavour", need: "I need to compare how roasts taste." })
    .returning()
    .all();
  // Four earlier Requests on the Problem, each with its author's Support.
  for (const [i, author] of authors.slice(1).entries()) {
    db.insert(requests)
      .values({
        title: `Earlier ${i + 1}`,
        description: i === 0 ? "x".repeat(300) : `Earlier request ${i + 1}.`,
        authorId: author.id,
        problemId: flavour.id,
        createdAt: new Date(Date.UTC(2026, 0, i + 1)),
      })
      .run();
    db.insert(supports).values({ personId: author.id, problemId: flavour.id }).run();
  }
  const intake = createIntake({ db, matcher: matchFirst });
  return { db, alex: authors[0], flavour, intake, review: createMatchReview({ db }) };
}

describe("loadInbox", () => {
  it("shows the compared Problem's need, supporter count and up to 3 Evidence excerpts, not the Request itself", async () => {
    const { db, alex, flavour, intake, review } = setup();
    const draft = { title: "Cupping notes", description: "Cupping notes, please." };
    const proposal = await intake.propose(draft);
    const confirmed = intake.confirm(draft, proposal, { attachTo: flavour.id }, alex.id);

    const [item] = loadInbox(db, review);

    expect(item.request.id).toBe(confirmed.requestId);
    expect(item.card.question).toBe("Does this Request share the need of this Problem?");
    expect(item.compared).toMatchObject({
      id: flavour.id,
      title: "Compare roast flavour",
      need: "I need to compare how roasts taste.",
      role: "match",
      supporters: 5,
    });
    expect(item.compared?.evidence.map((e) => [e.title, e.authorName])).toEqual([
      ["Earlier 1", "Bo"],
      ["Earlier 2", "Cy"],
      ["Earlier 3", "Di"],
    ]);
    // Long Evidence is cut to an excerpt.
    expect(item.compared?.evidence[0].excerpt).toHaveLength(161);
    expect(item.compared?.evidence[0].excerpt.endsWith("…")).toBe(true);
    // Low confidence, and a merge into a 5-supporter Problem.
    expect(item.reasons).toEqual([
      {
        reason: "high_demand_merge",
        label: "High-Demand merge",
        detail: "Merged into a Problem with 5 supporters (5 or more).",
      },
      { reason: "low_confidence", label: "Low confidence", detail: "The Matcher was 60% confident (below 75%)." },
    ]);
  });

  it("lists unreviewed decisions only: a reviewed one leaves the inbox", async () => {
    const { db, alex, intake, review } = setup();
    const draft = { title: "Cupping notes", description: "Cupping notes, please." };
    const proposal = await intake.propose(draft);
    const own = intake.confirm(draft, proposal, { createProblem: proposal.newProblem }, alex.id);

    const items = loadInbox(db, review);
    expect(items.map((i) => i.request.id)).toEqual([own.requestId]);

    review.review(items[0].id, "confirm", {}, alex.id);
    expect(loadInbox(db, review)).toEqual([]);
  });
});

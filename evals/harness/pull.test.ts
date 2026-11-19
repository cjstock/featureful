import { describe, expect, it } from "vitest";
import { createDb } from "@/db";
import { eq } from "drizzle-orm";
import { aiCalls, matchingDecisions, people, problems } from "@/db/schema";
import { offlineModel } from "@/lib/ai";
import { createIntake } from "@/lib/intake";
import { createLlmMatcher } from "@/lib/intake/llm-matcher";
import { createMatchReview } from "@/lib/match-review";
import { parseRegressionCases } from "../matcher/cases";
import { mergeRegressionCases, pullRegressionCases } from "./pull";
import type { MatcherCase } from "./types";

const NEW_PROBLEM = { title: "Time my pours", need: "I need to time each pour." };

/** An in-memory app with two Problems, Requests submitted through the LLM Matcher on an offline model. */
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
  const [grind, ratio] = db
    .insert(problems)
    .values([
      { title: "Dial in grind size", need: "I need to remember grind settings." },
      { title: "Work out water", need: "I need the water for my ratio." },
    ])
    .returning()
    .all();
  const answer = (matchedProblemId: number | null) =>
    offlineModel(
      JSON.stringify({
        matchedProblemId,
        confidence: matchedProblemId ? 0.9 : 0,
        reason: "Offline.",
        newProblem: NEW_PROBLEM,
        closestProblem: null,
      }),
    );
  /** Submit through the LLM Matcher (which records the AI call), accepting its answer. */
  async function submit(title: string, matchedProblemId: number | null) {
    const intake = createIntake({
      db,
      matcher: createLlmMatcher(db, { source: "app", person: alex.id, model: answer(matchedProblemId) }),
    });
    const draft = { title, description: `${title}, please.` };
    const proposal = await intake.propose(draft);
    const decision = proposal.match ? { attachTo: proposal.match.problemId } : { createProblem: proposal.newProblem };
    intake.confirm(draft, proposal, decision, alex.id);
    const review = createMatchReview({ db });
    return review
      .listQueue()
      .concat(review.listNotEscalated())
      .find((d) => d.request.title === title)!;
  }
  const review = createMatchReview({ db });
  return { db, alex, sam, grind, ratio, submit, review };
}

describe("pullRegressionCases", () => {
  it("exports each marked, reviewed decision as a regression case built from its AI call's shown Problems", async () => {
    const { db, alex, sam, grind, ratio, submit, review } = setup();
    await submit("Keep grind alive", grind.id);
    const moved = await submit("Water for 1:16", grind.id); // wrongly matched to grind
    const split = await submit("Bloom timer", grind.id); // a new need
    const unmarked = await submit("Grind notes", grind.id);
    const confirmed = await submit("Grind memory", grind.id);
    await submit("Unreviewed", grind.id);

    review.review(moved.id, "move", { targetProblemId: ratio.id, note: "It's about water." }, sam.id);
    review.review(split.id, "split", { newProblem: NEW_PROBLEM, note: "Timing is its own need." }, sam.id);
    review.review(unmarked.id, "move", { targetProblemId: ratio.id, note: "Hmm.", regressionCase: false }, sam.id);
    review.review(confirmed.id, "confirm", { regressionCase: true }, sam.id);
    // A marked decision whose Matcher left no AI call record can't be exported.
    const bare = createIntake({ db, matcher: async () => ({ match: null, newProblem: NEW_PROBLEM }) });
    const draft = { title: "No AI call", description: "Made by a fake." };
    bare.confirm(draft, await bare.propose(draft), { attachTo: grind.id }, alex.id);
    const noCall = review.listNotEscalated().concat(review.listQueue()).find((d) => d.request.title === "No AI call")!;
    review.review(noCall.id, "move", { targetProblemId: ratio.id, note: "Water." }, sam.id);

    const { cases, skipped } = pullRegressionCases(db);

    const shown = [
      { id: grind.id, title: grind.title, need: grind.need },
      { id: ratio.id, title: ratio.title, need: ratio.need },
    ];
    expect(cases).toEqual([
      {
        id: `regression-decision-${moved.id}`,
        kind: "regression",
        must: false,
        source: `Matching decision #${moved.id}`,
        problems: shown,
        request: { title: "Water for 1:16", description: "Water for 1:16, please." },
        expected: ratio.id,
      },
      expect.objectContaining({ source: `Matching decision #${split.id}`, expected: "new" }),
      expect.objectContaining({ source: `Matching decision #${confirmed.id}`, expected: grind.id }),
    ]);
    expect(skipped).toEqual([{ decisionId: noCall.id, why: "no AI call record with the Problems shown" }]);
    // The format regression.json is validated against when the eval loads it.
    expect(parseRegressionCases(JSON.parse(JSON.stringify(cases)))).toEqual(cases);
  });

  it("a Move to a Problem the Matcher wasn't shown expects a new Problem", async () => {
    const { db, sam, grind, submit, review } = setup();
    await submit("Keep grind alive", grind.id);
    const moved = await submit("Pour timer", grind.id);
    const later = db.insert(problems).values({ title: "Time pours", need: "I need to time pours." }).returning().get();

    review.review(moved.id, "move", { targetProblemId: later.id, note: "Timing, not grind." }, sam.id);

    expect(pullRegressionCases(db).cases).toMatchObject([{ expected: "new" }]);
  });


  it("drops a pre-cut AI call's Boundary notes from the shown Problems", async () => {
    const { db, sam, grind, ratio, submit, review } = setup();
    await submit("Keep grind alive", grind.id);
    const moved = await submit("Water for 1:16", grind.id);
    review.review(moved.id, "move", { targetProblemId: ratio.id, note: "It's about water." }, sam.id);
    const callId = db.select().from(matchingDecisions).where(eq(matchingDecisions.id, moved.id)).get()!.aiCallId!;
    db.update(aiCalls)
      .set({ shownProblems: [{ id: grind.id, title: grind.title, need: grind.need, boundaryNote: "Old note." }] })
      .where(eq(aiCalls.id, callId))
      .run();

    expect(pullRegressionCases(db).cases[0].problems).toEqual([{ id: grind.id, title: grind.title, need: grind.need }]);
  });
});

describe("mergeRegressionCases", () => {
  const regression = (id: string, expected: MatcherCase["expected"]): MatcherCase => ({
    id,
    kind: "regression",
    must: false,
    source: id,
    problems: [],
    request: { title: id, description: id },
    expected,
  });

  it("keeps existing cases in their order and appends new ones", () => {
    const merged = mergeRegressionCases(
      [regression("regression-decision-9", "new"), regression("regression-decision-2", 1)],
      [regression("regression-decision-2", 1), regression("regression-decision-10", "new")],
    );
    expect(merged.cases.map((c) => c.id)).toEqual([
      "regression-decision-9",
      "regression-decision-2",
      "regression-decision-10",
    ]);
    expect(merged).toMatchObject({ added: ["regression-decision-10"], replaced: [], conflicts: [] });
  });

  it("doesn't replace an existing case whose content differs, unless forced", () => {
    const existing = [regression("regression-decision-2", 1)];
    const pulled = [regression("regression-decision-2", 3)];

    const kept = mergeRegressionCases(existing, pulled);
    expect(kept.cases).toEqual(existing);
    expect(kept.conflicts).toEqual(["regression-decision-2"]);

    const forced = mergeRegressionCases(existing, pulled, { force: true });
    expect(forced.cases).toEqual(pulled);
    expect(forced.replaced).toEqual(["regression-decision-2"]);
  });
});

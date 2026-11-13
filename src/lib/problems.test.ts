import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb } from "@/db";
import { people, problems, requests } from "@/db/schema";
import { createIntake, type Matcher } from "@/lib/intake";
import { createMatchReview } from "@/lib/match-review";
import { addSupport, listProblems, removeSupport, type ProblemQuery } from "@/lib/problems";

function setup() {
  const db = createDb(":memory:");
  const [alex, priya] = db
    .insert(people)
    .values([
      { name: "Alex", role: "customer" },
      { name: "Priya", role: "customer" },
    ])
    .returning()
    .all();

  let day = 0;
  /** Each new Problem is one day newer than the last. */
  function problem(title: string) {
    day += 1;
    const [p] = db
      .insert(problems)
      .values({ title, need: `I need ${title.toLowerCase()}.`, createdAt: new Date(2026, 0, day) })
      .returning()
      .all();
    return p;
  }
  /** A Request by `author` as Evidence on `problemId` (submitters also Support it, as Intake does). */
  function ask(authorId: number, problemId: number) {
    const [r] = db
      .insert(requests)
      .values({ problemId, authorId, title: "Please", description: "Please help." })
      .returning()
      .all();
    addSupport(db, authorId, problemId);
    return r;
  }
  const list = (q: Partial<ProblemQuery> = {}) =>
    listProblems(db, { viewerId: alex.id, viewerIsCustomer: true, ...q });

  return { db, alex, priya, problem, ask, list };
}

describe("listProblems: Problems I've asked about", () => {
  it("lists Problems the Customer asked about first on Problems I support", () => {
    const { alex, problem, ask, list, db } = setup();
    const supportedOnly = problem("Track water hardness");
    const asked = problem("Save grinder clicks");
    const newestSupported = problem("Compare roasts");
    addSupport(db, alex.id, supportedOnly.id);
    addSupport(db, alex.id, newestSupported.id);
    ask(alex.id, asked.id);

    const items = list({ onlySupported: true, sort: "newest" });

    expect(items.map((i) => i.problem.title)).toEqual([
      "Save grinder clicks",
      "Compare roasts",
      "Track water hardness",
    ]);
  });

  it("keeps the chosen sort within each group", () => {
    const { db, alex, priya, problem, ask, list } = setup();
    const askedQuiet = problem("Save grinder clicks");
    const askedPopular = problem("Log brew ratios");
    const supportedQuiet = problem("Track water hardness");
    const supportedPopular = problem("Compare roasts");
    ask(alex.id, askedQuiet.id);
    ask(alex.id, askedPopular.id);
    addSupport(db, alex.id, supportedQuiet.id);
    addSupport(db, alex.id, supportedPopular.id);
    addSupport(db, priya.id, askedPopular.id);
    addSupport(db, priya.id, supportedPopular.id);

    expect(list({ onlySupported: true, sort: "support" }).map((i) => i.problem.title)).toEqual([
      "Log brew ratios",
      "Save grinder clicks",
      "Compare roasts",
      "Track water hardness",
    ]);
    expect(list({ onlySupported: true, sort: "newest" }).map((i) => i.problem.title)).toEqual([
      "Log brew ratios",
      "Save grinder clicks",
      "Compare roasts",
      "Track water hardness",
    ]);
  });

  it("counts only the viewer's own Requests on each Problem", () => {
    const { alex, priya, problem, ask, list } = setup();
    const grinder = problem("Save grinder clicks");
    const roasts = problem("Compare roasts");
    const water = problem("Track water hardness");
    ask(alex.id, grinder.id);
    ask(alex.id, grinder.id);
    ask(priya.id, grinder.id);
    ask(alex.id, roasts.id);
    ask(priya.id, water.id);

    const counts = Object.fromEntries(list().map((i) => [i.problem.title, i.ownRequestCount]));

    expect(counts).toEqual({
      "Save grinder clicks": 2,
      "Compare roasts": 1,
      "Track water hardness": 0,
    });
  });

  it("does not reorder All Problems, but still carries the count", () => {
    const { alex, problem, ask, list } = setup();
    problem("Track water hardness");
    const asked = problem("Save grinder clicks");
    problem("Compare roasts");
    ask(alex.id, asked.id);

    const items = list({ sort: "newest" });

    expect(items.map((i) => [i.problem.title, i.ownRequestCount])).toEqual([
      ["Compare roasts", 0],
      ["Save grinder clicks", 1],
      ["Track water hardness", 0],
    ]);
  });

  it("still applies search and Status filter on Problems I support", () => {
    const { db, alex, problem, ask, list } = setup();
    const grinder = problem("Save grinder clicks");
    const grindSize = problem("Dial in grind size");
    const roasts = problem("Compare roasts");
    ask(alex.id, grinder.id);
    ask(alex.id, roasts.id);
    addSupport(db, alex.id, grindSize.id);
    db.update(problems).set({ status: "planned" }).run();
    db.update(problems).set({ status: "open" }).where(eq(problems.id, grinder.id)).run();

    expect(list({ onlySupported: true, q: "grind" }).map((i) => i.problem.title)).toEqual([
      "Save grinder clicks",
      "Dial in grind size",
    ]);
    expect(
      list({ onlySupported: true, q: "grind", status: "planned" }).map((i) => i.problem.title),
    ).toEqual(["Dial in grind size"]);
  });

  it("leaves a Problem the Customer asked about but no longer supports off Problems I support", () => {
    const { db, alex, problem, ask, list } = setup();
    const asked = problem("Save grinder clicks");
    ask(alex.id, asked.id);
    removeSupport(db, alex.id, asked.id);

    expect(list({ onlySupported: true })).toEqual([]);
    expect(list().map((i) => i.ownRequestCount)).toEqual([1]);
  });

  it("does not compute the count for Internal stakeholders", () => {
    const { db, alex, problem, ask } = setup();
    const asked = problem("Save grinder clicks");
    ask(alex.id, asked.id);

    const items = listProblems(db, { viewerId: alex.id, onlySupported: false });

    expect(items.map((i) => i.ownRequestCount)).toEqual([0]);
  });

  it("follows a Request when a PM moves it to another Problem", async () => {
    const db = createDb(":memory:");
    const [alex, sam] = db
      .insert(people)
      .values([
        { name: "Alex", role: "customer" },
        { name: "Sam", role: "pm" },
      ])
      .returning()
      .all();
    const [grinder, roasts] = db
      .insert(problems)
      .values([
        { title: "Save grinder clicks", need: "I need to remember grind settings." },
        { title: "Compare roasts", need: "I need to compare roasts." },
      ])
      .returning()
      .all();
    const matchGrinder: Matcher = async () => ({
      match: { problemId: grinder.id, confidence: 0.8, reason: "Grind." },
      newProblem: { title: "x", need: "y" },
    });
    // Someone else's Evidence keeps the source Problem alive after the Move.
    db.insert(requests)
      .values({ problemId: grinder.id, authorId: sam.id, title: "Grind log", description: "Log grind." })
      .run();
    const intake = createIntake({ db, matcher: matchGrinder });
    const draft = { title: "Roast notes", description: "Let me note how roasts differ." };
    const proposal = await intake.propose(draft);
    intake.confirm(draft, proposal, { attachTo: grinder.id }, alex.id);
    const review = createMatchReview({ db, boundaryNoteWriter: async () => "" });
    const [decision] = review.listQueue();

    review.review(decision.id, "move", { targetProblemId: roasts.id }, sam.id);

    const counts = Object.fromEntries(
      listProblems(db, { viewerId: alex.id, viewerIsCustomer: true }).map((i) => [
        i.problem.title,
        i.ownRequestCount,
      ]),
    );
    expect(counts).toEqual({ "Save grinder clicks": 0, "Compare roasts": 1 });
  });
});

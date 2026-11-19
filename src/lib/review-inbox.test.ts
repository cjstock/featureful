import { describe, expect, it } from "vitest";
import type { EscalationReason } from "@/db/schema";
import { groupInbox, inboxCard, reasonDetail } from "@/lib/review-inbox";

const day = (n: number) => new Date(Date.UTC(2026, 10, n));
const decision = (id: number, createdDay: number, escalationReasons: EscalationReason[]) => ({
  id,
  createdAt: day(createdDay),
  escalationReasons,
});

describe("groupInbox", () => {
  it("groups by strongest Escalation reason in rank order, with counts, oldest first, Not escalated last", () => {
    const groups = groupInbox([
      decision(1, 5, ["low_confidence"]),
      decision(2, 3, []),
      decision(3, 4, ["near_miss"]),
      decision(4, 2, ["mine_is_different", "low_confidence"]),
      decision(5, 1, ["low_confidence"]),
      decision(6, 6, ["bypassed"]),
      decision(7, 1, []),
    ]);

    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Bypassed", 1],
      ["Mine is different", 1],
      ["Low confidence", 2],
      ["Near miss", 1],
      ["Not escalated", 2],
    ]);
    expect(groups.find((g) => g.key === "low_confidence")?.items.map((d) => d.id)).toEqual([5, 1]);
    expect(groups.at(-1)?.items.map((d) => d.id)).toEqual([7, 2]);
  });

  it("uses the strongest reason even when the stored reasons are out of order", () => {
    const groups = groupInbox([decision(1, 1, ["spot_check", "high_demand_merge"])]);
    expect(groups.map((g) => g.key)).toEqual(["high_demand_merge"]);
  });

  it("breaks createdAt ties by id and leaves out empty groups", () => {
    const groups = groupInbox([decision(9, 1, ["near_miss"]), decision(8, 1, ["near_miss"])]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((d) => d.id)).toEqual([8, 9]);
  });

  it("is empty for an empty inbox", () => {
    expect(groupInbox([])).toEqual([]);
  });
});

type CardInput = Parameters<typeof inboxCard>[0];

const flavour = { id: 1, title: "Compare roast flavour" };
const cupping = { id: 2, title: "Log cupping sessions" };

/** An accepted match: the Request sits on the Problem the Matcher proposed. */
const accepted: CardInput = {
  matcherOutcome: "ok",
  proposal: {
    match: { problemId: flavour.id, problemTitle: flavour.title, confidence: 0.7, reason: "Both about taste." },
    closestProblem: null,
  },
  currentProblem: flavour,
};

/** The Matcher proposed a new Problem, naming a runner-up. */
const nearMiss: CardInput = {
  matcherOutcome: "ok",
  proposal: { match: null, closestProblem: { problemId: flavour.id, problemTitle: flavour.title, confidence: 0.5 } },
  currentProblem: cupping,
};

const labels = (card: ReturnType<typeof inboxCard>) => card.verdicts.map((v) => [v.verdict, v.label]);

describe("inboxCard", () => {
  it("a match the Request sits on asks whether it shares the need, with Confirm, Move and Split", () => {
    const card = inboxCard(accepted);
    expect(card.compared).toEqual({ problemId: flavour.id, role: "match" });
    expect(card.question).toBe("Does this Request share the need of this Problem?");
    expect(labels(card)).toEqual([
      ["confirm", "Same need ✓"],
      ["move", "Belongs on another Problem"],
      ["split", "Needs its own Problem"],
    ]);
    expect(card.moveTarget).toBeNull();
  });

  it("a near miss compares the runner-up and asks whether it's a new need", () => {
    const card = inboxCard(nearMiss);
    expect(card.compared).toEqual({ problemId: flavour.id, role: "runner_up" });
    expect(card.question).toBe("Is this a new need, or the same as this Problem?");
    expect(labels(card)).toEqual([
      ["move", "Belongs on an existing Problem"],
      ["confirm", "Keep as its own Problem"],
    ]);
    expect(card.moveTarget).toBe(flavour.id);
  });

  it("a bypassed decision asks to group the Request, with nothing to compare", () => {
    const card = inboxCard({
      matcherOutcome: "off",
      proposal: { match: null, closestProblem: null },
      currentProblem: cupping,
    });
    expect(card.compared).toBeNull();
    expect(card.question).toBe("Group this Request");
    expect(labels(card)).toEqual([
      ["move", "Belongs on an existing Problem"],
      ["confirm", "Keep as its own Problem"],
    ]);
    expect(card.moveTarget).toBeNull();
  });

  it("mine is different: the Request is on its own Problem, compared with the rejected match", () => {
    const card = inboxCard({ ...accepted, currentProblem: cupping });
    expect(card.compared).toEqual({ problemId: flavour.id, role: "match" });
    expect(card.question).toBe("Does this Request share the need of this Problem?");
    expect(labels(card).map(([v]) => v)).toEqual(["move", "confirm"]);
    expect(card.moveTarget).toBe(flavour.id);
  });

  it("a new Problem with no runner-up asks whether it needs its own Problem", () => {
    const card = inboxCard({ ...nearMiss, proposal: { match: null, closestProblem: null } });
    expect(card.compared).toBeNull();
    expect(card.question).toBe("Does this need its own Problem?");
  });

  it("a compared Problem that was deleted counts as nothing to compare", () => {
    const card = inboxCard({
      ...nearMiss,
      proposal: { match: null, closestProblem: { problemId: null, problemTitle: null, confidence: 0.5 } },
    });
    expect(card.compared).toBeNull();
  });
});

describe("reasonDetail", () => {
  const context = {
    matcherOutcome: "ok" as const,
    matchConfidence: 0.62,
    closestConfidence: 0.48,
    supporters: 7,
  };

  it("explains each Escalation reason from the decision", () => {
    expect(reasonDetail("bypassed", { ...context, matcherOutcome: "budget" })).toBe(
      "The Matcher was bypassed: it was out of budget.",
    );
    expect(reasonDetail("mine_is_different", context)).toBe("The submitter said their need is different.");
    expect(reasonDetail("high_demand_merge", context)).toBe("Merged into a Problem with 7 supporters (5 or more).");
    expect(reasonDetail("low_confidence", context)).toBe("The Matcher was 62% confident (below 75%).");
    expect(reasonDetail("near_miss", context)).toBe("No match, but the closest Problem was at 48% (40% or more).");
    expect(reasonDetail("spot_check", context)).toBe("A random 10% sample of decisions with no other reason.");
  });
});

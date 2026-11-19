import { describe, expect, it } from "vitest";
import { escalationReasons, isSpotCheck, type EscalationInput } from "@/lib/escalation";

/** An accepted, confident match into a small Problem, with the Matcher working: no reason at all. */
const quiet: EscalationInput = {
  decisionId: 1,
  matcherOutcome: "ok",
  submitterChoice: "accepted",
  matchConfidence: 0.9,
  closestConfidence: null,
  supporters: 2,
};

/** A decision id outside the spot-check sample (with the configured salt): 1, 2, 14, 20 and 22 are in it. */
const quietId = 3;

describe("escalationReasons", () => {
  it("a confident accepted match into a small Problem is Auto-accepted (no reasons)", () => {
    expect(escalationReasons({ ...quiet, decisionId: quietId })).toEqual([]);
  });

  it("Bypassed when the Matcher failed, was off or out of budget", () => {
    for (const matcherOutcome of ["failed", "off", "budget"] as const) {
      expect(
        escalationReasons({
          ...quiet,
          decisionId: quietId,
          matcherOutcome,
          submitterChoice: "no_match",
          matchConfidence: null,
        }),
      ).toEqual(["bypassed"]);
    }
  });

  it("Mine is different when the submitter rejected the match", () => {
    expect(escalationReasons({ ...quiet, decisionId: quietId, submitterChoice: "rejected" })).toEqual([
      "mine_is_different",
    ]);
  });

  it("High-Demand merge when an accepted match leaves the Problem with at least 5 supporters, counting the submitter", () => {
    expect(escalationReasons({ ...quiet, decisionId: quietId, supporters: 5 })).toEqual(["high_demand_merge"]);
    expect(escalationReasons({ ...quiet, decisionId: quietId, supporters: 4 })).toEqual([]);
    // Rejecting the match is not a merge.
    expect(
      escalationReasons({ ...quiet, decisionId: quietId, submitterChoice: "rejected", supporters: 9 }),
    ).toEqual(["mine_is_different"]);
  });

  it("Low confidence for a match below 0.75", () => {
    expect(escalationReasons({ ...quiet, decisionId: quietId, matchConfidence: 0.74 })).toEqual(["low_confidence"]);
    expect(escalationReasons({ ...quiet, decisionId: quietId, matchConfidence: 0.75 })).toEqual([]);
  });

  it("Near miss when no match was proposed and the closest Problem's confidence is at least 0.4", () => {
    const newProblem = { ...quiet, decisionId: quietId, submitterChoice: "no_match" as const, matchConfidence: null };
    expect(escalationReasons({ ...newProblem, closestConfidence: 0.4 })).toEqual(["near_miss"]);
    expect(escalationReasons({ ...newProblem, closestConfidence: 0.39 })).toEqual([]);
    expect(escalationReasons({ ...newProblem, closestConfidence: null })).toEqual([]);
  });

  it("lists every reason that applies, strongest first", () => {
    expect(
      escalationReasons({
        ...quiet,
        decisionId: quietId,
        submitterChoice: "rejected",
        matchConfidence: 0.5,
      }),
    ).toEqual(["mine_is_different", "low_confidence"]);
  });

  it("Spot check: a stable, seeded sample of the decisions with no other reason, and never alongside one", () => {
    // Known members of the sample with the configured salt.
    expect([...Array(30)].map((_, i) => i + 1).filter(isSpotCheck)).toEqual([1, 2, 14, 20, 22]);
    const id = 14;
    expect(escalationReasons({ ...quiet, decisionId: id })).toEqual(["spot_check"]);
    expect(escalationReasons({ ...quiet, decisionId: id })).toEqual(["spot_check"]);
    expect(escalationReasons({ ...quiet, decisionId: id, submitterChoice: "rejected" })).toEqual([
      "mine_is_different",
    ]);
  });

  it("Spot check samples about 10% of decision ids", () => {
    const sampled = [...Array(10_000)].map((_, i) => i + 1).filter(isSpotCheck).length;
    expect(sampled / 10_000).toBeGreaterThan(0.09);
    expect(sampled / 10_000).toBeLessThan(0.11);
  });
});

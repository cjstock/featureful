import type { EscalationReason, MatcherOutcome } from "@/db/schema";

/** Copy for Escalation, safe to import from client components (no server code). */

export const ESCALATION_REASON_LABELS: Record<EscalationReason, string> = {
  bypassed: "Bypassed",
  mine_is_different: "Mine is different",
  high_demand_merge: "High-Demand merge",
  low_confidence: "Low confidence",
  near_miss: "Near miss",
  spot_check: "Spot check",
};

/** How the Matcher took part, as a clause ("The Matcher was bypassed (it failed)"). */
export const MATCHER_OUTCOME_LABELS: Record<MatcherOutcome, string> = {
  ok: "it answered",
  failed: "it failed",
  off: "it was switched off",
  budget: "it was out of budget",
};

/** Asked of a PM giving a Move or Split, which can't be saved without an answer. */
export const DIFFERENT_NEEDS_QUESTION = "What makes these different needs?";

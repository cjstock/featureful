import { ESCALATION_REASONS, type EscalationReason, type MatcherOutcome, type Verdict } from "@/db/schema";
import { ESCALATION } from "@/lib/config";
import { ESCALATION_REASON_LABELS, MATCHER_OUTCOME_LABELS } from "@/lib/escalation-labels";
import type { MatchingDecisionItem } from "@/lib/match-review";

/**
 * The Escalation inbox on /review: how the Match review queue is grouped and what each card
 * asks. Pure, so it is safe to import from client components.
 */

/** An inbox group: one per strongest Escalation reason, then "Not escalated" (Auto-accepted). */
export type InboxGroupKey = EscalationReason | "not_escalated";

export type InboxGroup<T> = { key: InboxGroupKey; label: string; items: T[] };

/** What grouping needs from a Matching decision. */
type Groupable = { id: number; createdAt: Date; escalationReasons: readonly EscalationReason[] };

/** Groups in display order: strongest reason first, "Not escalated" last. */
const GROUP_ORDER: readonly InboxGroupKey[] = [...ESCALATION_REASONS, "not_escalated"];

const GROUP_LABELS: Record<InboxGroupKey, string> = {
  ...ESCALATION_REASON_LABELS,
  not_escalated: "Not escalated",
};

/** A decision's strongest Escalation reason, or null when it was Auto-accepted. */
export function strongestReason(reasons: readonly EscalationReason[]): EscalationReason | null {
  return ESCALATION_REASONS.find((r) => reasons.includes(r)) ?? null;
}

/**
 * The inbox's groups: by each decision's strongest Escalation reason in rank order, oldest first
 * within a group, with the Auto-accepted decisions last as "Not escalated". Empty groups are left out.
 */
export function groupInbox<T extends Groupable>(items: readonly T[]): InboxGroup<T>[] {
  const byKey = new Map<InboxGroupKey, T[]>();
  for (const item of items) {
    const key = strongestReason(item.escalationReasons) ?? "not_escalated";
    byKey.set(key, [...(byKey.get(key) ?? []), item]);
  }
  const oldestFirst = (a: T, b: T) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id;
  return GROUP_ORDER.flatMap((key) => {
    const group = byKey.get(key);
    return group ? [{ key, label: GROUP_LABELS[key], items: [...group].sort(oldestFirst) }] : [];
  });
}

/** What a card is built from: a Matching decision's proposal and where its Request sits now. */
export type CardInput = Pick<MatchingDecisionItem, "matcherOutcome" | "currentProblem"> & {
  proposal: Pick<MatchingDecisionItem["proposal"], "match" | "closestProblem">;
};

/** The Problem a card compares the Request with: the proposed match, or the runner-up on a near miss. */
export type ComparedRef = { problemId: number; role: "match" | "runner_up" };

export type VerdictOption = { verdict: Verdict; label: string };

export type InboxCard = {
  compared: ComparedRef | null;
  /** The one question the card asks the PM. */
  question: string;
  /** In keyboard order: `1`, `2`, `3`. */
  verdicts: VerdictOption[];
  /** The Problem a Move starts on (the compared one, when the Request isn't on it). */
  moveTarget: number | null;
};

/** The Request sits on the compared Problem: is it the same need? */
const ON_COMPARED: VerdictOption[] = [
  { verdict: "confirm", label: "Same need ✓" },
  { verdict: "move", label: "Belongs on another Problem" },
  { verdict: "split", label: "Needs its own Problem" },
];

/** The Request sits on its own Problem (bypassed, mine is different, no match): group it. */
const ON_ITS_OWN: VerdictOption[] = [
  { verdict: "move", label: "Belongs on an existing Problem" },
  { verdict: "confirm", label: "Keep as its own Problem" },
];

/** What an inbox card shows and offers for a Matching decision. */
export function inboxCard({ matcherOutcome, proposal, currentProblem }: CardInput): InboxCard {
  const bypassed = matcherOutcome !== "ok";
  const compared: ComparedRef | null =
    bypassed
      ? null
      : proposal.match
        ? proposal.match.problemId !== null
          ? { problemId: proposal.match.problemId, role: "match" }
          : null
        : proposal.closestProblem?.problemId != null
          ? { problemId: proposal.closestProblem.problemId, role: "runner_up" }
          : null;
  const onCompared = compared !== null && compared.problemId === currentProblem.id;
  const question = bypassed
    ? "Group this Request"
    : compared?.role === "runner_up"
      ? "Is this a new need, or the same as this Problem?"
      : compared
        ? "Does this Request share the need of this Problem?"
        : "Does this need its own Problem?";
  return {
    compared,
    question,
    verdicts: onCompared ? ON_COMPARED : ON_ITS_OWN,
    moveTarget: compared && !onCompared ? compared.problemId : null,
  };
}

/** What a reason's detail is computed from. */
export type ReasonContext = {
  matcherOutcome: MatcherOutcome;
  matchConfidence: number | null;
  closestConfidence: number | null;
  /** Supporters of the Problem the Request is on. */
  supporters: number;
};

const percent = (n: number | null) => `${Math.round((n ?? 0) * 100)}%`;

/** Why a decision was escalated for this reason, in a sentence (the reason chip's hover). */
export function reasonDetail(reason: EscalationReason, c: ReasonContext): string {
  switch (reason) {
    case "bypassed":
      return `The Matcher was bypassed: ${MATCHER_OUTCOME_LABELS[c.matcherOutcome]}.`;
    case "mine_is_different":
      return "The submitter said their need is different.";
    case "high_demand_merge":
      return `Merged into a Problem with ${c.supporters} supporters (${ESCALATION.highDemandSupporters} or more).`;
    case "low_confidence":
      return `The Matcher was ${percent(c.matchConfidence)} confident (below ${percent(ESCALATION.lowConfidenceBelow)}).`;
    case "near_miss":
      return `No match, but the closest Problem was at ${percent(c.closestConfidence)} (${percent(ESCALATION.nearMissAtLeast)} or more).`;
    case "spot_check":
      return `A random ${percent(ESCALATION.spotCheckRate)} sample of decisions with no other reason.`;
  }
}

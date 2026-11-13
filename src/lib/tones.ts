import type { Role, Status, Verdict } from "@/db/schema";
import { adjustedScore, type CriterionKey, type PriorityScore } from "./scoring";

/**
 * Tones: semantic colour names for domain values. Pure; the only place colour thresholds live.
 * Components ask this module for a tone and render it via the tone styles in
 * `@/components/tone-styles` (Badge `tone` prop, edges, dots). Never hard-code colours.
 * Each tone has CSS tokens `--tone-<name>` (solid), `-subtle` (badge bg) and `-fg` (badge text)
 * in both themes (`src/app/globals.css`).
 */
export const TONES = [
  "status-open",
  "status-planned",
  "status-progress",
  "status-shipped",
  "status-declined",
  "positive",
  "caution",
  "negative",
  "neutral",
  "info",
  "override",
  "role-customer",
  "role-support",
  "role-pm",
] as const;
export type Tone = (typeof TONES)[number];

/** The Priority band. "not-evaluated" renders as a dashed neutral chip. */
export type PriorityTone = "positive" | "caution" | "neutral" | "not-evaluated";

/** 70+ positive, 40–69 caution, below 40 neutral. Unevaluated (and not overridden) → not-evaluated. */
export function priorityTone(priority: Pick<PriorityScore, "total" | "evaluated" | "overridden">): PriorityTone {
  if (!priority.evaluated && !priority.overridden) return "not-evaluated";
  if (priority.total >= 70) return "positive";
  if (priority.total >= 40) return "caution";
  return "neutral";
}

/** Match confidence (0–1): 0.85+ positive, 0.6–0.84 caution, below 0.6 negative. */
export function confidenceTone(confidence: number): Tone {
  if (confidence >= 0.85) return "positive";
  if (confidence >= 0.6) return "caution";
  return "negative";
}

/**
 * How much a criterion's 1–5 score helps the Priority score, Effort and Risk inverted:
 * adjusted 4–5 positive, 3 caution, 1–2 negative; null (not evaluated) neutral.
 */
export function criterionTone(criterion: CriterionKey, score: number | null): Tone {
  if (score === null) return "neutral";
  const adjusted = adjustedScore(criterion, score);
  if (adjusted >= 4) return "positive";
  if (adjusted === 3) return "caution";
  return "negative";
}

const STATUS_TONES: Record<Status, Tone> = {
  open: "status-open",
  planned: "status-planned",
  in_progress: "status-progress",
  shipped: "status-shipped",
  declined: "status-declined",
};

export function statusTone(status: Status): Tone {
  return STATUS_TONES[status];
}

const VERDICT_TONES: Record<Verdict, Tone> = {
  confirm: "positive",
  move: "info",
  split: "caution",
};

export function verdictTone(verdict: Verdict): Tone {
  return VERDICT_TONES[verdict];
}

const ROLE_TONES: Record<Role, Tone> = {
  customer: "role-customer",
  support_agent: "role-support",
  pm: "role-pm",
};

export function roleTone(role: Role): Tone {
  return ROLE_TONES[role];
}

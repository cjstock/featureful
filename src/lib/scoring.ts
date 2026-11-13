import { DEFAULT_WEIGHTS, type Weights } from "./scoring-config";

/**
 * Priority scoring: turns the AI criterion scores, the supporter count, the weights and an
 * optional PM override into a 0–100 Priority score with a per-criterion breakdown. Pure.
 *
 * - Demand is derived from the supporter count (0–1 → 1, 2–3 → 2, 4–5 → 3, 6–8 → 4, 9+ → 5).
 * - Effort and Risk are inverted (6 − score). Scores are clamped to 1–5.
 * - Each criterion is normalized as (s − 1) / 4, weighted, and the weights are scaled to sum to 100.
 * - Not evaluated: a missing AI score contributes 0 points and `evaluated` is false. A Problem with
 *   no AI scores therefore gets a Demand-only score (at most the Demand weight, 25 by default).
 * - Override: `total` becomes the override (clamped 0–100); `computedTotal` is still returned.
 */

export type CriterionKey = keyof Weights;

const CRITERIA: readonly CriterionKey[] = ["demand", "impact", "strategicFit", "effort", "risk"];

/** Lower is better for these, so they are inverted (6 − score) before weighting. */
const INVERTED: ReadonlySet<CriterionKey> = new Set(["effort", "risk"]);

export interface CriterionBreakdown {
  criterion: CriterionKey;
  /** 1–5 as judged by the AI (Demand: derived from supporter count); null when not evaluated. */
  score: number | null;
  /** 1–5 where higher always raises priority (Effort/Risk inverted); null when not evaluated. */
  adjusted: number | null;
  /** Weight as configured. */
  weight: number;
  /** Contribution to the 0–100 computed total; 0 when not evaluated. */
  points: number;
}

export interface PriorityScore {
  /** The Priority score to show and sort by: the override if set, otherwise computedTotal. */
  total: number;
  /** The score from the criteria, always returned (shown alongside an override). Rounded to an integer. */
  computedTotal: number;
  overridden: boolean;
  /** False when any AI criterion is missing; missing criteria contribute 0 points. */
  evaluated: boolean;
  breakdown: CriterionBreakdown[];
}

export interface ScoringInput {
  supporterCount: number;
  impact: number | null;
  strategicFit: number | null;
  effort: number | null;
  risk: number | null;
  /** PM override (0–100). Replaces the total; null/undefined means no override. */
  override?: number | null;
  weights?: Weights;
}

function demandLevel(supporterCount: number): number {
  if (supporterCount >= 9) return 5;
  if (supporterCount >= 6) return 4;
  if (supporterCount >= 4) return 3;
  if (supporterCount >= 2) return 2;
  return 1;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function scorePriority(input: ScoringInput): PriorityScore {
  const weights = input.weights ?? DEFAULT_WEIGHTS;
  const weightSum = CRITERIA.reduce((sum, key) => sum + Math.max(0, weights[key]), 0);

  const raw: Record<CriterionKey, number | null> = {
    demand: demandLevel(input.supporterCount),
    impact: input.impact,
    strategicFit: input.strategicFit,
    effort: input.effort,
    risk: input.risk,
  };

  const breakdown = CRITERIA.map((criterion): CriterionBreakdown => {
    const weight = weights[criterion];
    const score = raw[criterion];
    if (score === null) return { criterion, score, adjusted: null, weight, points: 0 };
    const bounded = clamp(score, 1, 5);
    const adjusted = INVERTED.has(criterion) ? 6 - bounded : bounded;
    // Normalize (s − 1) / 4, weight, and scale so the weights sum to 100 (one division keeps it exact).
    const points = weightSum > 0 ? ((adjusted - 1) * Math.max(0, weight) * 100) / (4 * weightSum) : 0;
    return { criterion, score, adjusted, weight, points };
  });

  const computedTotal = Math.round(clamp(breakdown.reduce((sum, c) => sum + c.points, 0), 0, 100));

  const overridden = input.override != null;

  return {
    total: overridden ? Math.round(clamp(input.override!, 0, 100)) : computedTotal,
    computedTotal,
    overridden,
    evaluated: breakdown.every((c) => c.score !== null),
    breakdown,
  };
}

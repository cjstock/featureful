/**
 * Priority scoring weights. The one place to tune how much each criterion counts.
 * Weights are relative: the total is always scaled to 0–100 by their sum.
 */
export const DEFAULT_WEIGHTS = {
  demand: 25,
  impact: 25,
  strategicFit: 20,
  effort: 15,
  risk: 15,
} as const satisfies Record<string, number>;

export type Weights = Record<keyof typeof DEFAULT_WEIGHTS, number>;

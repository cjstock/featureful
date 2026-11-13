import type { Problem } from "@/db/schema";
import type { CriterionKey, PriorityScore } from "@/lib/scoring";
import { Badge } from "@/components/ui/badge";

export const CRITERION_LABELS: Record<CriterionKey, string> = {
  demand: "Demand",
  impact: "Impact",
  strategicFit: "Strategic fit",
  effort: "Effort",
  risk: "Risk",
};

const INVERTED_NOTE: Partial<Record<CriterionKey, string>> = {
  effort: "lower Effort scores higher",
  risk: "delivery Risk; lower scores higher",
};

const dateTimeFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
const points = (n: number) => (Math.round(n * 10) / 10).toString();

function reasonFor(criterion: CriterionKey, problem: Problem, supporterCount: number) {
  switch (criterion) {
    case "demand":
      return `${supporterCount} ${supporterCount === 1 ? "person supports" : "people support"} this Problem (computed live).`;
    case "impact":
      return problem.impactReason;
    case "strategicFit":
      return problem.strategicFitReason;
    case "effort":
      return problem.effortReason;
    case "risk":
      return problem.riskReason;
  }
}

/** Per-criterion Priority score breakdown for Internal stakeholders. */
export function ScoreBreakdown({
  problem,
  priority,
  supporterCount,
}: {
  problem: Problem;
  priority: PriorityScore;
  supporterCount: number;
}) {
  const weightSum = priority.breakdown.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  const maxPoints = (weight: number) => (weightSum > 0 ? (Math.max(0, weight) * 100) / weightSum : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-3xl font-semibold tabular-nums">{priority.total}</span>
        <span className="text-sm text-muted-foreground">/ 100</span>
        {priority.overridden && (
          <span className="text-sm text-muted-foreground">
            Overridden (computed {priority.computedTotal})
            {problem.overrideNote ? `: ${problem.overrideNote}` : ""}
          </span>
        )}
        {!priority.evaluated && <Badge variant="outline">Not evaluated</Badge>}
      </div>

      {!priority.evaluated && (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          The AI hasn&apos;t scored this Problem yet, or its last evaluation failed. Until it does, the
          score counts Demand only.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Criterion</th>
              <th className="py-2 pr-3 font-medium">Score</th>
              <th className="py-2 pr-3 font-medium">Reason</th>
              <th className="py-2 text-right font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {priority.breakdown.map((c) => (
              <tr key={c.criterion} className="border-t align-top">
                <td className="py-2 pr-3">
                  <div className="font-medium">{CRITERION_LABELS[c.criterion]}</div>
                  {INVERTED_NOTE[c.criterion] && (
                    <div className="text-xs text-muted-foreground">{INVERTED_NOTE[c.criterion]}</div>
                  )}
                </td>
                <td className="py-2 pr-3 tabular-nums">
                  {c.score === null ? <span className="text-muted-foreground">–</span> : `${c.score}/5`}
                </td>
                <td className="py-2 pr-3">
                  {c.score === null ? (
                    <span className="text-muted-foreground">Not evaluated</span>
                  ) : (
                    reasonFor(c.criterion, problem, supporterCount)
                  )}
                </td>
                <td className="py-2 text-right tabular-nums whitespace-nowrap">
                  {points(c.points)}
                  <span className="text-muted-foreground"> / {points(maxPoints(c.weight))}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className="py-2 pr-3" colSpan={3}>
                Computed total
              </td>
              <td className="py-2 text-right tabular-nums">{priority.computedTotal}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {problem.evaluatedAt
          ? `Evaluated by AI ${dateTimeFormat.format(problem.evaluatedAt)}.`
          : "Never evaluated by AI."}
      </p>
    </div>
  );
}

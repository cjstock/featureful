import { adjustedScore, CRITERION_LABELS, type CriterionKey } from "@/lib/scoring";
import { criterionTone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { TONE_STYLES } from "@/components/tone-styles";

const DOTS = [1, 2, 3, 4, 5];

/**
 * Five-dot meter for one criterion: filled dots show how much it helps the Priority score
 * (Effort and Risk inverted, so low Effort fills more dots), coloured by `criterionTone`.
 * The raw 1–5 score stays visible as text.
 */
export function CriterionMeter({ criterion, score }: { criterion: CriterionKey; score: number | null }) {
  const filled = score === null ? 0 : adjustedScore(criterion, score);
  const solid = TONE_STYLES[criterionTone(criterion, score)].solid;
  const label =
    score === null
      ? `${CRITERION_LABELS[criterion]}: not evaluated`
      : `${CRITERION_LABELS[criterion]}: ${score} of 5, helps the Priority score ${filled} of 5`;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" role="img" aria-label={label} title={label}>
      <span className="inline-flex gap-1" aria-hidden>
        {DOTS.map((n) => (
          <span
            key={n}
            className={cn("size-2.5 rounded-full", n <= filled ? solid : "bg-muted-foreground/25")}
          />
        ))}
      </span>
      <span className="tabular-nums" aria-hidden>
        {score === null ? <span className="text-muted-foreground">–</span> : `${score}/5`}
      </span>
    </span>
  );
}

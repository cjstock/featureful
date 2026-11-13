import type { PriorityScore } from "@/lib/scoring";
import { priorityTone, type PriorityTone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/** Words for each Priority band, so the chip never relies on colour alone. */
const BAND_LABELS: Record<PriorityTone, string> = {
  positive: "high priority",
  caution: "medium priority",
  neutral: "low priority",
  "not-evaluated": "not evaluated",
};

/**
 * The Priority score as a chip coloured by band (see `priorityTone`). Unevaluated scores get a
 * dashed grey chip; pair it with `<NotEvaluatedBadge>` for the visible label.
 */
export function ScoreChip({
  priority,
  size = "default",
  className,
}: {
  priority: Pick<PriorityScore, "total" | "evaluated" | "overridden">;
  size?: "default" | "lg";
  className?: string;
}) {
  const band = priorityTone(priority);
  const notEvaluated = band === "not-evaluated";
  const label = `Priority score ${priority.total}, ${BAND_LABELS[band]}`;
  return (
    <Badge
      tone={notEvaluated ? "neutral" : band}
      title={label}
      aria-label={label}
      className={cn(
        "font-semibold tabular-nums",
        size === "lg" ? "h-auto px-3 py-1 text-2xl" : "h-6 px-2.5 text-sm",
        notEvaluated && "border-dashed border-tone-neutral",
        className,
      )}
    >
      {priority.total}
    </Badge>
  );
}

/** Dashed grey "Not evaluated" label for a Problem the AI hasn't scored. */
export function NotEvaluatedBadge({ className }: { className?: string }) {
  return (
    <Badge tone="neutral" className={cn("border-dashed border-tone-neutral", className)}>
      Not evaluated
    </Badge>
  );
}

/** Violet badge marking a PM override of the Priority score. */
export function OverrideBadge({
  note,
  children = "Override",
  className,
}: {
  note?: string | null;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge tone="override" title={note ?? undefined} className={className}>
      {children}
    </Badge>
  );
}

import { AlertTriangle, Clock, PauseCircle } from "lucide-react";
import {
  failedAtLabel,
  isFresh,
  notEvaluatedLabel,
  STALE_LABEL,
  type EvaluationFreshness,
} from "@/lib/evaluation-freshness";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Problem page (Internal stakeholders): says when the scores are out of date or the latest
 * evaluation failed, or was refused ("Not evaluated (budget reached / Evaluator off)"). PMs are
 * pointed at the card's "Re-evaluate" button. Renders nothing when fresh.
 */
export function FreshnessNotice({
  freshness,
  canReevaluate,
  className,
}: {
  freshness: EvaluationFreshness;
  canReevaluate: boolean;
  className?: string;
}) {
  if (isFresh(freshness)) return null;
  const { stale, failedAt, refusal } = freshness;
  return (
    <div role="status" className={cn("space-y-1 rounded-md border px-3 py-2 text-sm", className)}>
      {failedAt && refusal && (
        <p className="flex items-center gap-1.5 font-medium" title={failedAt.toISOString()}>
          <PauseCircle className="size-4 shrink-0" aria-hidden />
          {notEvaluatedLabel(refusal)}
        </p>
      )}
      {failedAt && !refusal && (
        <p className="flex items-center gap-1.5 font-medium text-destructive" title={failedAt.toISOString()}>
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {failedAtLabel(failedAt)}
        </p>
      )}
      {stale && (
        <p className="flex items-center gap-1.5 font-medium">
          <Clock className="size-4 shrink-0" aria-hidden />
          {STALE_LABEL}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {canReevaluate
          ? "The scores below may be out of date. Re-evaluate to refresh them."
          : "The scores below may be out of date until a PM re-evaluates."}
      </p>
    </div>
  );
}

/** Problems list (Internal stakeholders): a small marker per Problem. Renders nothing when fresh. */
export function FreshnessMarker({ freshness }: { freshness: EvaluationFreshness | undefined }) {
  if (!freshness || isFresh(freshness)) return null;
  const { stale, failedAt, refusal } = freshness;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {failedAt && refusal && (
        <Badge tone="caution" title={notEvaluatedLabel(refusal)}>
          Not evaluated
        </Badge>
      )}
      {failedAt && !refusal && (
        <Badge tone="negative" title={failedAtLabel(failedAt)}>
          Evaluation failed
        </Badge>
      )}
      {stale && (
        <Badge tone="caution" title={STALE_LABEL}>
          Stale
        </Badge>
      )}
    </div>
  );
}

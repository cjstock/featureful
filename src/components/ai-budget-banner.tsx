import { Gauge } from "lucide-react";
import { getDb } from "@/db/client";
import { budgetReachedLabel, budgetStatus } from "@/lib/ai-controls";
import { cn } from "@/lib/utils";
import { TONE_STYLES } from "@/components/tone-styles";

/**
 * PM banner (top of `/review`): once an app AI call has been refused for budget today, says when
 * and that it resets at 00:00 UTC. Renders nothing otherwise.
 */
export function AiBudgetBanner() {
  let reachedAt: Date | null;
  try {
    reachedAt = budgetStatus(getDb(), new Date()).reachedAt;
  } catch (error) {
    // A misconfigured AI_DAILY_BUDGET_USD refuses every call; say so rather than break the page.
    console.error("Couldn't read the AI budget", error);
    return (
      <p role="status" className={cn("rounded-lg px-4 py-3 text-sm font-medium", TONE_STYLES.negative.badge)}>
        The AI budget is misconfigured (AI_DAILY_BUDGET_USD), so every AI call is refused.
      </p>
    );
  }
  if (!reachedAt) return null;
  return (
    <p
      role="status"
      className={cn("flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium", TONE_STYLES.caution.badge)}
    >
      <Gauge className="size-4 shrink-0" aria-hidden />
      {budgetReachedLabel(reachedAt)}. New Requests are saved as new Problems for you to group.
    </p>
  );
}

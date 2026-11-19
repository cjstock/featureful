import { AI_ESTIMATE_NOTE } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { badgeVariants } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * "AI estimate" tag for a criterion score the AI judged without seeing the codebase (Effort,
 * Risk; see `isAiEstimate`). The explanation shows as a tooltip on hover or focus.
 */
export function AiEstimateTag({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`AI estimate: ${AI_ESTIMATE_NOTE}`}
        className={cn(badgeVariants({ tone: "info" }), "cursor-help", className)}
      >
        AI estimate
      </TooltipTrigger>
      <TooltipContent>{AI_ESTIMATE_NOTE}</TooltipContent>
    </Tooltip>
  );
}

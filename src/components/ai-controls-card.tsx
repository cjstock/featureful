import type { CallableAiModule } from "@/db/schema";
import type { AiControl, BudgetStatus } from "@/lib/ai-controls";
import { AI_MODULE_LABELS } from "@/lib/ai-calls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AiModuleSwitch } from "@/components/ai-module-switch";

const flipTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** What each module does while it's off. */
const WHEN_OFF: Record<CallableAiModule, string> = {
  matcher: "Off: each Request becomes a new Problem, queued for a PM to group.",
  evaluator: "Off: Problems show Not evaluated (Evaluator off).",
  decision_note: "Off: “Draft with AI” is disabled; write the Decision note by hand.",
  brief: "Off: “Generate brief” is disabled.",
};

/**
 * AI controls on `/strategy`: each AI module's off switch with its last flip, and today's app
 * budget. PMs flip the switches; Support agents see them read-only.
 */
export function AiControlsCard({
  controls,
  budget,
  canEdit,
}: {
  controls: AiControl[];
  /** Null when AI_DAILY_BUDGET_USD is misconfigured. */
  budget: BudgetStatus | null;
  canEdit: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI controls</CardTitle>
        <CardDescription>
          {budget
            ? `Today's AI spend: $${budget.spentUsd.toFixed(2)} of $${budget.budgetUsd.toFixed(2)} (resets 00:00 UTC). `
            : "The AI budget is misconfigured (AI_DAILY_BUDGET_USD), so every AI call is refused. "}
          Switching a module off stops its AI calls; the app keeps working without it.
          {!canEdit && " Only a PM can flip a switch."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {controls.map(({ module, on, lastFlip }) => (
            <li key={module} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="space-y-0.5">
                <p className="flex items-center gap-2 font-medium">
                  {AI_MODULE_LABELS[module]}
                  <Badge tone={on ? "positive" : "negative"}>{on ? "On" : "Off"}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {lastFlip
                    ? `Switched ${lastFlip.on ? "on" : "off"} by ${lastFlip.personName}, ${flipTime.format(lastFlip.at)} UTC.`
                    : "Never switched; on by default."}{" "}
                  {WHEN_OFF[module]}
                </p>
              </div>
              {canEdit && <AiModuleSwitch module={module} label={AI_MODULE_LABELS[module]} on={on} />}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

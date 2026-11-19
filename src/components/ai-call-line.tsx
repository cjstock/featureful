import { formatAiCallLine, type AiCallLine as AiCallLineData } from "@/lib/ai-calls";
import { ViewPromptButton } from "@/components/view-prompt-button";

/** PM only: "Matcher · v3f9a · $0.004 · 1.2s · view prompt" for the AI call behind a result. */
export function AiCallLine({ aiCall }: { aiCall: AiCallLineData }) {
  const label = formatAiCallLine(aiCall);
  return (
    <p className="text-xs text-muted-foreground">
      {label} · <ViewPromptButton aiCallId={aiCall.id} label={label} />
    </p>
  );
}

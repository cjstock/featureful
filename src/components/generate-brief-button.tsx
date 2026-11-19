"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { generateDecisionBrief } from "@/app/actions/brief";
import { Button } from "@/components/ui/button";

/**
 * PM only: generate (or regenerate) the Decision brief for a Problem. Disabled, with
 * `disabledReason` shown, while the Brief writer is switched off or the AI budget is reached.
 */
export function GenerateBriefButton({
  problemId,
  hasBrief,
  disabledReason = null,
}: {
  problemId: number;
  hasBrief: boolean;
  disabledReason?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () =>
    startTransition(async () => {
      setError(null);
      const result = await generateDecisionBrief(problemId);
      if (!result.ok) setError(result.error);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {error && (
        <span role="status" className="text-sm text-destructive">
          {error}
        </span>
      )}
      {disabledReason && !error && <span className="text-sm text-muted-foreground">{disabledReason}</span>}
      <Button variant="outline" size="sm" disabled={pending || disabledReason !== null} onClick={run}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Writing brief…" : hasBrief ? "Regenerate brief" : "Generate brief"}
      </Button>
    </div>
  );
}

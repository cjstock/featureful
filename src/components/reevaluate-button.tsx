"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { reevaluateAllProblems, reevaluateProblem } from "@/app/actions/evaluation";
import { Button } from "@/components/ui/button";

/** PM only: re-evaluate one Problem (with `problemId`) or every Problem (without). */
export function ReevaluateButton({
  problemId,
  variant = "outline",
}: {
  problemId?: number;
  variant?: "outline" | "default";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const all = problemId === undefined;

  const run = () =>
    startTransition(async () => {
      setMessage(null);
      if (all) {
        const result = await reevaluateAllProblems();
        if (!result.ok) setMessage({ text: result.error, error: true });
        else
          setMessage({
            text:
              result.failed === 0
                ? `Re-evaluated ${result.total} Problems.`
                : `Re-evaluated ${result.total - result.failed} of ${result.total} Problems; ${result.failed} failed.`,
            error: result.failed > 0,
          });
      } else {
        const result = await reevaluateProblem(problemId);
        setMessage(result.ok ? { text: "Re-evaluated.", error: false } : { text: result.error, error: true });
      }
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant={variant} size="sm" disabled={pending} onClick={run}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Evaluating…" : all ? "Re-evaluate all" : "Re-evaluate"}
      </Button>
      {message && (
        <span
          role="status"
          className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}

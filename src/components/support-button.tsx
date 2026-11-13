"use client";

import { useState, useTransition } from "react";
import { setSupport } from "@/app/actions/support";
import { Button } from "@/components/ui/button";

/** One-click Support toggle for every role. "Support" here is the action, not the Support agent role. */
export function SupportButton({
  problemId,
  supported,
  size = "sm",
  compact = false,
}: {
  problemId: number;
  supported: boolean;
  size?: "sm" | "default";
  /** Short labels for tight spots such as the internal table. */
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () =>
    startTransition(async () => {
      setError(null);
      const result = await setSupport(problemId, !supported);
      if (!result.ok) setError(result.error);
    });

  const button = (
    <Button
      size={size}
      variant={supported ? "secondary" : "default"}
      disabled={pending}
      aria-pressed={supported}
      title={compact && supported ? "Remove my Support" : undefined}
      onClick={toggle}
    >
      {pending
        ? "Saving…"
        : compact
          ? supported
            ? "Supported"
            : "Support"
          : supported
            ? "Supported · Remove my Support"
            : "Support this Problem"}
    </Button>
  );

  if (!error) return button;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {button}
      <span role="alert" className="text-xs text-destructive">
        {error}
      </span>
    </span>
  );
}

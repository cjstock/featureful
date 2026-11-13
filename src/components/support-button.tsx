"use client";

import { useTransition } from "react";
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
  return (
    <Button
      size={size}
      variant={supported ? "secondary" : "default"}
      disabled={pending}
      aria-pressed={supported}
      title={compact && supported ? "Remove my Support" : undefined}
      onClick={() => startTransition(() => setSupport(problemId, !supported))}
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
}

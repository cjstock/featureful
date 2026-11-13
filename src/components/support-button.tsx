"use client";

import { useTransition } from "react";
import { setSupport } from "@/app/actions/support";
import { Button } from "@/components/ui/button";

/** One-click Support toggle for Customers. "Support" here is the action, not the Support agent role. */
export function SupportButton({
  problemId,
  supported,
  size = "sm",
}: {
  problemId: number;
  supported: boolean;
  size?: "sm" | "default";
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size={size}
      variant={supported ? "secondary" : "default"}
      disabled={pending}
      aria-pressed={supported}
      onClick={() => startTransition(() => setSupport(problemId, !supported))}
    >
      {pending ? "Saving…" : supported ? "Supported · Remove my Support" : "Support this Problem"}
    </Button>
  );
}

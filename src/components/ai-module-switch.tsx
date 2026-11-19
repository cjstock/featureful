"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setAiModuleOn } from "@/app/actions/ai-controls";
import type { CallableAiModule } from "@/db/schema";
import { Button } from "@/components/ui/button";

/** PM only: switch one AI module on or off (AI controls on `/strategy`). */
export function AiModuleSwitch({ module, label, on }: { module: CallableAiModule; label: string; on: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const flip = () =>
    startTransition(async () => {
      setError(null);
      const result = await setAiModuleOn(module, !on);
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
      <Button
        variant={on ? "outline" : "default"}
        size="sm"
        role="switch"
        aria-checked={on}
        aria-label={`${label}: ${on ? "on" : "off"}`}
        disabled={pending}
        onClick={flip}
      >
        {pending && <Loader2 className="animate-spin" />}
        {on ? "Switch off" : "Switch on"}
      </Button>
    </div>
  );
}

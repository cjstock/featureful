"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { viewAiCall } from "@/app/actions/ai-calls";
import type { AiCallContent } from "@/lib/ai-calls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const dateTimeFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "medium" });

function Block({ title, text }: { title: string; text: string }) {
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-medium text-muted-foreground uppercase">{title}</h3>
      <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-words">
        {text}
      </pre>
    </section>
  );
}

/** PM only: "view prompt" opens an AI call's stored prompt and output, fetched (and role-checked) on the server. */
export function ViewPromptButton({ aiCallId, label }: { aiCallId: number; label: string }) {
  const [pending, startTransition] = useTransition();
  const [aiCall, setAiCall] = useState<AiCallContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (open: boolean) => {
    if (!open || aiCall) return;
    startTransition(async () => {
      setError(null);
      const result = await viewAiCall(aiCallId);
      if (result.ok) setAiCall(result.aiCall);
      else setError(result.error);
    });
  };

  return (
    <Dialog onOpenChange={load}>
      <DialogTrigger className="text-primary underline-offset-4 hover:underline">view prompt</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>AI call</DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        {pending && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        )}
        {error && (
          <p role="status" className="text-destructive">
            {error}
          </p>
        )}
        {aiCall && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {aiCall.model} · {aiCall.source} · {dateTimeFormat.format(new Date(aiCall.time))} · outcome{" "}
              {aiCall.outcome}
            </p>
            {aiCall.error && <Block title="Error" text={aiCall.error} />}
            <Block title="System prompt" text={aiCall.system} />
            <Block title="Prompt" text={aiCall.prompt} />
            {aiCall.shownProblems != null && (
              <Block title="Problems shown" text={JSON.stringify(aiCall.shownProblems, null, 2)} />
            )}
            <Block title="Output" text={aiCall.output ?? "(no output)"} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProductStrategy } from "@/app/actions/evaluation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** PM only: edit the single Product Strategy text. */
export function ProductStrategyForm({ initialBody }: { initialBody: string }) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [saved, setSaved] = useState(initialBody);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = body.trim() !== saved.trim();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await updateProductStrategy(body);
          if (result.ok) {
            setSaved(body);
            setMessage({ text: "Saved. Re-evaluate all Problems to update Strategic fit.", error: false });
            router.refresh();
          } else {
            setMessage({ text: result.error, error: true });
          }
        });
      }}
    >
      <Label htmlFor="strategy-body" className="sr-only">
        Product Strategy
      </Label>
      <Textarea
        id="strategy-body"
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          setMessage(null);
        }}
        rows={10}
        maxLength={5000}
        required
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !dirty || body.trim() === ""}>
          {pending ? "Saving…" : "Save strategy"}
        </Button>
        {message && (
          <span role="status" className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}

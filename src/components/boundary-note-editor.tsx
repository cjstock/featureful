"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { updateBoundaryNote } from "@/app/actions/match-review";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** PM only: inline editor for a Problem's Boundary note (blank clears it). */
export function BoundaryNoteEditor({ problemId, note }: { problemId: number; note: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      setError(null);
      const result = await updateBoundaryNote(problemId, draft);
      if (!result.ok) return setError(result.error);
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => (setDraft(note ?? ""), setError(null), setOpen(true))}
      >
        {note ? "Edit Boundary note" : "Write Boundary note"}
      </Button>
    );
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-md border p-3">
      <div className="space-y-1.5">
        <Label htmlFor={`boundary-note-${problemId}`}>Boundary note</Label>
        <Textarea
          id={`boundary-note-${problemId}`}
          maxLength={1000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Includes … Does not include …"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        The Matcher reads this whenever it considers this Problem. Leave blank to clear it.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save Boundary note
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

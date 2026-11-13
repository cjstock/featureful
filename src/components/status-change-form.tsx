"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { draftNote, updateStatus } from "@/app/actions/decision";
import { STATUSES, type Status } from "@/db/schema";
import { STATUS_LABELS } from "@/lib/problems";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** PM only: change a Problem's Status with a Decision note; the AI can draft the note for editing. */
export function StatusChangeForm({
  problemId,
  status: currentStatus,
  note: currentNote,
}: {
  problemId: number;
  status: Status;
  note: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(currentStatus);
  const [note, setNote] = useState(currentNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [drafting, startDraft] = useTransition();
  const [saving, startSave] = useTransition();
  const busy = drafting || saving;

  const reset = () => {
    setStatus(currentStatus);
    setNote(currentNote ?? "");
    setError(null);
  };

  const draft = () =>
    startDraft(async () => {
      setError(null);
      const result = await draftNote(problemId, status);
      if (!result.ok) return setError(result.error);
      setNote(result.note);
    });

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    startSave(async () => {
      setError(null);
      const result = await updateStatus(problemId, { status, note });
      if (!result.ok) return setError(result.error);
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => (reset(), setOpen(true))}>
        Change Status
      </Button>
    );
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-md border p-3">
      <div className="space-y-1.5">
        <Label htmlFor={`status-${problemId}`}>Status</Label>
        <select
          id={`status-${problemId}`}
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          disabled={busy}
          className={selectClass}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor={`decision-note-${problemId}`}>Decision note (Customers see this)</Label>
          <Button type="button" variant="ghost" size="sm" onClick={draft} disabled={busy}>
            {drafting ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {drafting ? "Drafting…" : "Draft with AI"}
          </Button>
        </div>
        <Textarea
          id={`decision-note-${problemId}`}
          required
          maxLength={2000}
          rows={5}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={drafting}
          placeholder="Explain to supporters why the Status is changing."
        />
      </div>
      <p className="text-xs text-muted-foreground">
        The AI draft uses the Decision brief (if any) and the Evidence. Edit it as needed; nothing is
        saved until you click Save.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {saving && <Loader2 className="animate-spin" />}
          Save Status and note
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

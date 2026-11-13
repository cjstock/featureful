"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { clearOverride, overrideScore } from "@/app/actions/score-override";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** PM only: set, edit or clear a Problem's Priority score override. */
export function ScoreOverrideForm({
  problemId,
  current,
}: {
  problemId: number;
  /** The existing override, if any. */
  current: { score: number; note: string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(current ? String(current.score) : "");
  const [note, setNote] = useState(current?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setScore(current ? String(current.score) : "");
    setNote(current?.note ?? "");
    setError(null);
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      setError(null);
      const result = await overrideScore(problemId, {
        score: score.trim() === "" ? Number.NaN : Number(score),
        note,
      });
      if (!result.ok) return setError(result.error);
      setOpen(false);
      router.refresh();
    });
  };

  const clear = () =>
    startTransition(async () => {
      setError(null);
      const result = await clearOverride(problemId);
      if (!result.ok) return setError(result.error);
      setScore("");
      setNote("");
      router.refresh();
    });

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => (reset(), setOpen(true))} disabled={pending}>
          {current ? "Edit override" : "Override score"}
        </Button>
        {current && (
          <Button variant="ghost" size="sm" onClick={clear} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Clear override
          </Button>
        )}
        {error && (
          <span role="alert" className="text-sm text-destructive">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-md border p-3">
      <div className="space-y-1.5">
        <Label htmlFor={`override-score-${problemId}`}>Override Priority score (0–100)</Label>
        <Input
          id={`override-score-${problemId}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          required
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className="w-28"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`override-note-${problemId}`}>Why? (required)</Label>
        <Textarea
          id={`override-note-${problemId}`}
          required
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Contractual commitment to a key account this quarter."
        />
      </div>
      <p className="text-xs text-muted-foreground">
        The override replaces the computed score for display and sorting until you clear it.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save override
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

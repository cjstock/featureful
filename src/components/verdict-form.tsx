"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import type { MatchReviewInput } from "@/app/actions/match-review";
import { DIFFERENT_NEEDS_QUESTION } from "@/lib/escalation-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ProblemOption = { id: number; title: string };

const listClass =
  "w-full rounded-lg border border-input bg-transparent p-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The inline form for a Move or Split: the target (an existing Problem, or the new one), the
 * required note, and "Add as Regression case", ticked by default. Mount it with a `key` per
 * decision and verdict so it starts fresh.
 */
export function VerdictForm({
  verdict,
  submitLabel,
  currentProblemId,
  moveTarget,
  problems,
  newProblem,
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  verdict: "move" | "split";
  submitLabel: string;
  currentProblemId: number;
  /** The Problem a Move starts on, if any. */
  moveTarget: number | null;
  /** Every Problem, for the Move target. */
  problems: ProblemOption[];
  /** The Matcher's new-Problem statement, pre-filled for Split. */
  newProblem: { title: string; need: string };
  saving: boolean;
  error: string | null;
  onSubmit: (input: MatchReviewInput) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [note, setNote] = useState("");
  const [regressionCase, setRegressionCase] = useState(true);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<number | null>(moveTarget);
  const [title, setTitle] = useState(newProblem.title);
  const [need, setNeed] = useState(newProblem.need);
  const [invalid, setInvalid] = useState<string | null>(null);

  const candidates = problems.filter(
    (p) => p.id !== currentProblemId && p.title.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return setInvalid(`${DIFFERENT_NEEDS_QUESTION} A note is required.`);
    if (verdict === "move") {
      if (target === null) return setInvalid("Choose a Problem to move the Request to");
      setInvalid(null);
      return onSubmit({ verdict: "move", targetProblemId: target, note, regressionCase });
    }
    setInvalid(null);
    onSubmit({ verdict: "split", newProblem: { title, need }, note, regressionCase });
  };

  const shown = invalid ?? error;
  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border p-3 text-sm">
      {verdict === "move" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-search`}>Move the Request to</Label>
          <Input
            id={`${id}-search`}
            type="search"
            placeholder="Search Problems…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={saving}
          />
          <select
            aria-label="Target Problem"
            size={Math.min(6, Math.max(2, candidates.length))}
            value={target ?? ""}
            onChange={(e) => setTarget(Number(e.target.value))}
            disabled={saving}
            className={listClass}
          >
            {candidates.map((p) => (
              <option key={p.id} value={p.id} className="rounded px-2 py-1">
                {p.title}
              </option>
            ))}
          </select>
          {candidates.length === 0 && <p className="text-xs text-muted-foreground">No other Problem matches.</p>}
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-title`}>New Problem title</Label>
            <Input
              id={`${id}-title`}
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-need`}>Need</Label>
            <Textarea
              id={`${id}-need`}
              required
              maxLength={2000}
              rows={3}
              value={need}
              onChange={(e) => setNeed(e.target.value)}
              disabled={saving}
            />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-note`}>{DIFFERENT_NEEDS_QUESTION} (required, internal; the Matcher learns from it)</Label>
        <Textarea
          id={`${id}-note`}
          autoFocus
          maxLength={2000}
          rows={2}
          required
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={saving}
        />
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={regressionCase}
          onChange={(e) => setRegressionCase(e.target.checked)}
          disabled={saving}
          className="size-4 accent-primary"
        />
        Add as Regression case
      </label>

      <p className="text-xs text-muted-foreground">
        The submitter&apos;s Support follows the Request. A Problem left with no Evidence is deleted, and
        both Problems are re-evaluated.
      </p>
      {shown && (
        <p role="alert" className="text-destructive">
          {shown}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

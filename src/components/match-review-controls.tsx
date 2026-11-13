"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { reviewMatch, type MatchReviewInput } from "@/app/actions/match-review";
import type { Verdict } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ProblemOption = { id: number; title: string };

const listClass =
  "w-full rounded-lg border border-input bg-transparent p-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** PM only: Confirm, Move, or Split a Matching decision, with an optional note. */
export function MatchReviewControls({
  decisionId,
  currentProblemId,
  problems,
  newProblem,
}: {
  decisionId: number;
  currentProblemId: number;
  /** Every Problem, for the Move target select. */
  problems: ProblemOption[];
  /** The Matcher's new-Problem statement, pre-filled for Split. */
  newProblem: { title: string; need: string };
}) {
  const router = useRouter();
  const id = useId();
  const [mode, setMode] = useState<Verdict | null>(null);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<number | null>(null);
  const [title, setTitle] = useState(newProblem.title);
  const [need, setNeed] = useState(newProblem.need);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const open = (verdict: Verdict) => {
    setMode(verdict);
    setNote("");
    setSearch("");
    setTarget(null);
    setTitle(newProblem.title);
    setNeed(newProblem.need);
    setError(null);
  };

  const candidates = problems.filter(
    (p) => p.id !== currentProblemId && p.title.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!mode) return;
    let input: MatchReviewInput;
    if (mode === "move") {
      if (target === null) return setError("Choose a Problem to move the Request to");
      input = { verdict: "move", targetProblemId: target, note };
    } else if (mode === "split") {
      input = { verdict: "split", newProblem: { title, need }, note };
    } else {
      input = { verdict: "confirm", note };
    }
    startSave(async () => {
      setError(null);
      const result = await reviewMatch(decisionId, input);
      if (!result.ok) return setError(result.error);
      setMode(null);
      router.refresh();
    });
  };

  if (!mode) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => open("confirm")}>
          Confirm
        </Button>
        <Button size="sm" variant="outline" onClick={() => open("move")}>
          Move
        </Button>
        <Button size="sm" variant="outline" onClick={() => open("split")}>
          Split
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border p-3">
      {mode === "confirm" && (
        <p className="text-muted-foreground">Confirm that the Request is on the right Problem.</p>
      )}

      {mode === "move" && (
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
          {candidates.length === 0 && (
            <p className="text-xs text-muted-foreground">No other Problem matches.</p>
          )}
        </div>
      )}

      {mode === "split" && (
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
        <Label htmlFor={`${id}-note`}>Note (optional, internal; the Matcher learns from it)</Label>
        <Textarea
          id={`${id}-note`}
          maxLength={2000}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={saving}
          placeholder="Why is this the right grouping?"
        />
      </div>

      {mode !== "confirm" && (
        <p className="text-xs text-muted-foreground">
          The submitter&apos;s Support follows the Request. A Problem left with no Evidence is
          deleted, and both Problems are re-evaluated.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {mode === "confirm" ? "Confirm" : mode === "move" ? "Move Request" : "Split into new Problem"}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setMode(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

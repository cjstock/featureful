"use client";

// PROTOTYPE (v2 wayfinder ticket 05): throwaway. Three structurally different Match review queues
// on /review?variant=A|B|C. Real seed data; verdicts are stubbed in memory (nothing is saved).

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import {
  REASON_LABELS,
  REASON_ORDER,
  type ProtoItem,
  type ProtoProblem,
  type ReasonKey,
} from "./prototype-data";

type Verdict = "confirm" | "move" | "split";
type Outcome = { verdict: Verdict; regression: boolean; note: string; target?: string };
type Data = { escalated: ProtoItem[]; notEscalated: ProtoItem[]; problems: { id: number; title: string }[] };

const VARIANTS = [
  { key: "A", name: "Annotated list" },
  { key: "B", name: "Triage inbox" },
  { key: "C", name: "Focus mode" },
];

const REASON_TONE: Record<ReasonKey, "negative" | "caution" | "info" | "neutral"> = {
  bypassed: "negative",
  different: "caution",
  highDemand: "caution",
  lowConfidence: "info",
  nearMiss: "info",
  spotCheck: "neutral",
};

export function MatchReviewPrototype({ variant, data }: { variant: string; data: Data }) {
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const record = (id: number, o: Outcome) => setOutcomes((prev) => ({ ...prev, [id]: o }));
  const props = { data, outcomes, record };
  return (
    <div className="space-y-4 pb-20">
      <p className="rounded-md border border-dashed border-fuchsia-500 p-2 text-xs text-muted-foreground">
        PROTOTYPE: real seed Requests; reasons marked † are simulated; verdicts are not saved. Flip
        variants with ← → or the bar below.
      </p>
      {variant === "B" ? <VariantB {...props} /> : variant === "C" ? <VariantC {...props} /> : <VariantA {...props} />}
      <SessionState outcomes={outcomes} />
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </div>
  );
}

type VariantProps = {
  data: Data;
  outcomes: Record<number, Outcome>;
  record: (id: number, o: Outcome) => void;
};

/* ---------- shared bits ---------- */

function ReasonChips({ item }: { item: ProtoItem }) {
  return (
    <div className="flex flex-wrap gap-1">
      {item.reasons.map((r) => (
        <Badge key={r.key} tone={REASON_TONE[r.key]} title={r.detail}>
          {REASON_LABELS[r.key]}
          {r.simulated && "†"}
        </Badge>
      ))}
    </div>
  );
}

function question(item: ProtoItem) {
  if (item.kind === "bypassed") return "Group this Request";
  if (item.kind === "new" && item.compared) return "Is this a new need, or the same as this Problem?";
  if (item.kind === "new") return "Does this need its own Problem?";
  return "Does this Request share the need of this Problem?";
}

function RequestSide({ item }: { item: ProtoItem }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        New Request · {item.submitter.name}
      </p>
      <p className="font-medium">{item.request.title}</p>
      <p className="whitespace-pre-wrap text-sm">{item.request.description}</p>
      {item.kind !== "bypassed" && (
        <p className="text-xs text-muted-foreground">
          Matcher proposed new Problem: “{item.newProblem.title}”
        </p>
      )}
    </div>
  );
}

function ProblemSide({ problem, item }: { problem: ProtoProblem | null; item: ProtoItem }) {
  if (!problem)
    return (
      <div className="space-y-1 text-sm text-muted-foreground">
        <p className="text-xs uppercase tracking-wide">Compared Problem</p>
        <p>{item.kind === "bypassed" ? "The Matcher didn't run. Pick a Problem or keep it new." : "No close Problem."}</p>
      </div>
    );
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {item.kind === "match" ? "Matched Problem" : "Runner-up Problem"} · {problem.supporters} supporters
      </p>
      <p className="font-medium">{problem.title}</p>
      <p className="text-sm">{problem.need}</p>
      {problem.evidence.length > 0 && (
        <ul className="space-y-1 border-l-2 pl-3 text-xs text-muted-foreground">
          {problem.evidence.map((e, i) => (
            <li key={i}>
              <span className="font-medium text-foreground">{e.title}</span> ({e.author}): {e.excerpt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MatcherLine({ item }: { item: ProtoItem }) {
  return (
    <p className="text-xs text-muted-foreground">
      {item.reason && <>Matcher: “{item.reason}” · </>}
      {item.confidence !== null && <>{Math.round(item.confidence * 100)}% · </>}
      Matcher {item.trace.version} · {item.trace.cost} · {item.trace.latency} ·{" "}
      <span className="underline">view prompt</span>
    </p>
  );
}

function VerdictPanel({
  item,
  problems,
  onDone,
  compact,
}: {
  item: ProtoItem;
  problems: { id: number; title: string }[];
  onDone: (o: Outcome) => void;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<Verdict | null>(null);
  const [note, setNote] = useState("");
  const [regression, setRegression] = useState(true);
  const [target, setTarget] = useState<string>("");
  const [title, setTitle] = useState(item.newProblem.title);

  const bypassed = item.kind === "bypassed";
  const labels: Record<Verdict, string> = bypassed
    ? { confirm: "Keep as its own Problem", move: "Belongs on an existing Problem", split: "Keep as its own Problem" }
    : { confirm: "Same need ✓", move: "Belongs on another Problem", split: "Needs its own Problem" };
  const verdicts: Verdict[] = bypassed ? ["move", "confirm"] : ["confirm", "move", "split"];
  const needsNote = mode === "move" || mode === "split";
  const canSubmit = mode && (!needsNote || note.trim()) && (mode !== "move" || target);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {verdicts.map((v, i) => (
          <Button
            key={v}
            size="sm"
            variant={mode === v ? "default" : "outline"}
            onClick={() => (v === "confirm" ? onDone({ verdict: v, regression: false, note: "" }) : setMode(v))}
          >
            {compact && <kbd className="mr-1 font-mono text-[10px] opacity-60">{i + 1}</kbd>}
            {labels[v]}
          </Button>
        ))}
      </div>
      {mode && (
        <div className="space-y-2 rounded-md border p-3">
          {mode === "move" && (
            <select
              className="w-full rounded-md border bg-transparent p-1 text-sm"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose a Problem…</option>
              {problems
                .filter((p) => p.id !== item.currentProblemId)
                .map((p) => (
                  <option key={p.id} value={p.title}>
                    {p.title}
                  </option>
                ))}
            </select>
          )}
          {mode === "split" && <Input value={title} onChange={(e) => setTitle(e.target.value)} />}
          <Textarea
            placeholder="What makes these different needs? (required)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          {needsNote && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={regression} onChange={(e) => setRegression(e.target.checked)} />
              Add as Regression case
            </label>
          )}
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() => onDone({ verdict: mode, regression: needsNote && regression, note, target: target || title })}
          >
            Save verdict
          </Button>
        </div>
      )}
    </div>
  );
}

function OutcomeBadge({ o }: { o: Outcome }) {
  return (
    <Badge tone={o.verdict === "confirm" ? "positive" : "caution"}>
      {o.verdict === "confirm" ? "Confirmed" : o.verdict === "move" ? `Moved → ${o.target}` : `Split → ${o.target}`}
      {o.regression && " · Regression case +1"}
    </Badge>
  );
}

function stats(outcomes: Record<number, Outcome>) {
  const all = Object.values(outcomes);
  const agreed = all.filter((o) => o.verdict === "confirm").length;
  return {
    reviewed: all.length,
    agreement: all.length ? Math.round((agreed / all.length) * 100) : null,
    regressions: all.filter((o) => o.regression).length,
  };
}

function SessionState({ outcomes }: { outcomes: Record<number, Outcome> }) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary>Prototype state</summary>
      <pre className="overflow-x-auto">{JSON.stringify(outcomes, null, 2)}</pre>
    </details>
  );
}

/* ---------- Variant A: annotated list (today's page, fixed) ---------- */

function VariantA({ data, outcomes, record }: VariantProps) {
  const [tab, setTab] = useState<"queue" | "auto">("queue");
  const open = data.escalated.filter((i) => !outcomes[i.id]);
  const list = tab === "queue" ? data.escalated : data.notEscalated;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Match review</h1>
        <p className="text-muted-foreground">
          Only Escalations are here, strongest reason first. Everything else was Auto-accepted.
        </p>
      </div>
      <div className="flex gap-1 text-sm">
        <button className={cn("rounded-md px-3 py-1.5", tab === "queue" && "bg-muted")} onClick={() => setTab("queue")}>
          To review <Badge variant="secondary">{open.length}</Badge>
        </button>
        <button className={cn("rounded-md px-3 py-1.5", tab === "auto" && "bg-muted")} onClick={() => setTab("auto")}>
          Not escalated <Badge variant="secondary">{data.notEscalated.length}</Badge>
        </button>
      </div>
      <ul className="space-y-4">
        {list.map((item) => (
          <li key={item.id} className={cn("space-y-3 rounded-xl border p-4", outcomes[item.id] && "opacity-60")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ReasonChips item={item} />
              {outcomes[item.id] && <OutcomeBadge o={outcomes[item.id]} />}
            </div>
            <p className="font-heading font-semibold">{question(item)}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <RequestSide item={item} />
              <ProblemSide problem={item.compared} item={item} />
            </div>
            <MatcherLine item={item} />
            {!outcomes[item.id] && (
              <VerdictPanel key={item.id} item={item} problems={data.problems} onDone={(o) => record(item.id, o)} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Variant B: triage inbox (list grouped by reason + detail pane, keyboard) ---------- */

function VariantB({ data, outcomes, record }: VariantProps) {
  const ordered = data.escalated;
  const [selected, setSelected] = useState<number | null>(ordered[0]?.id ?? null);
  const item = [...ordered, ...data.notEscalated].find((i) => i.id === selected) ?? null;
  const groups = useMemo(() => {
    const byKey = new Map<ReasonKey, ProtoItem[]>();
    for (const i of ordered) {
      const top = REASON_ORDER.find((k) => i.reasons.some((r) => r.key === k))!;
      byKey.set(top, [...(byKey.get(top) ?? []), i]);
    }
    return REASON_ORDER.filter((k) => byKey.has(k)).map((k) => ({ key: k, items: byKey.get(k)! }));
  }, [ordered]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select")) return;
      const idx = ordered.findIndex((i) => i.id === selected);
      if (e.key === "j") setSelected(ordered[Math.min(ordered.length - 1, idx + 1)]?.id ?? null);
      if (e.key === "k") setSelected(ordered[Math.max(0, idx - 1)]?.id ?? null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered, selected]);

  const s = stats(outcomes);
  const nextOpen = (from: number) => ordered.find((i, n) => n > ordered.findIndex((x) => x.id === from) && !outcomes[i.id]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-heading text-2xl font-semibold">Match review inbox</h1>
        <p className="text-xs text-muted-foreground">
          j/k to move · {ordered.filter((i) => !outcomes[i.id]).length} open · agreement{" "}
          {s.agreement ?? "–"}% · {s.regressions} Regression cases
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <nav className="max-h-[70vh] space-y-3 overflow-y-auto rounded-xl border p-2 text-sm">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">
                {REASON_LABELS[g.key]} ({g.items.length})
              </p>
              {g.items.map((i) => (
                <button
                  key={i.id}
                  onClick={() => setSelected(i.id)}
                  className={cn(
                    "block w-full truncate rounded-md px-2 py-1 text-left",
                    selected === i.id && "bg-muted",
                    outcomes[i.id] && "text-muted-foreground line-through",
                  )}
                >
                  {i.request.title}
                </button>
              ))}
            </div>
          ))}
          <div>
            <p className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">
              Not escalated ({data.notEscalated.length})
            </p>
            {data.notEscalated.map((i) => (
              <button
                key={i.id}
                onClick={() => setSelected(i.id)}
                className={cn("block w-full truncate rounded-md px-2 py-1 text-left text-muted-foreground", selected === i.id && "bg-muted")}
              >
                {i.request.title}
              </button>
            ))}
          </div>
        </nav>
        {item ? (
          <section className="space-y-3 rounded-xl border p-4">
            <ReasonChips item={item} />
            <p className="font-heading text-lg font-semibold">{question(item)}</p>
            <div className="grid gap-4 lg:grid-cols-2">
              <RequestSide item={item} />
              <ProblemSide problem={item.compared} item={item} />
            </div>
            <MatcherLine item={item} />
            {outcomes[item.id] ? (
              <OutcomeBadge o={outcomes[item.id]} />
            ) : (
              <VerdictPanel
                key={item.id}
                compact
                item={item}
                problems={data.problems}
                onDone={(o) => {
                  record(item.id, o);
                  setSelected(nextOpen(item.id)?.id ?? item.id);
                }}
              />
            )}
          </section>
        ) : (
          <p className="text-muted-foreground">Nothing selected.</p>
        )}
      </div>
    </div>
  );
}

/* ---------- Variant C: focus mode (one at a time, outcomes front and centre) ---------- */

function VariantC({ data, outcomes, record }: VariantProps) {
  const open = data.escalated.filter((i) => !outcomes[i.id]);
  const item = open[0];
  const [suggestion, setSuggestion] = useState<{ item: ProtoItem; o: Outcome } | null>(null);
  const s = stats(outcomes);
  const total = data.escalated.length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="PM agreement (this session)" value={s.agreement === null ? "–" : `${s.agreement}%`} />
        <Stat label="Escalated" value={`${total} of ${total + data.notEscalated.length}`} />
        <Stat label="Regression cases added" value={String(s.regressions)} />
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${((total - open.length) / Math.max(1, total)) * 100}%` }} />
      </div>

      {suggestion ? (
        <section className="space-y-3 rounded-xl border-2 border-dashed p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Suggested Boundary note (only if the Boundary-notes ablation keeps them)
          </p>
          <p className="font-medium">{suggestion.item.compared?.title ?? suggestion.o.target}</p>
          <p className="rounded-md bg-muted p-3 text-sm">
            Includes: {suggestion.item.compared?.need ?? "…"} Does not include: needs like “
            {suggestion.item.request.title}”{suggestion.o.note && ` (${suggestion.o.note})`}.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setSuggestion(null)}>
              Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSuggestion(null)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
              Dismiss
            </Button>
          </div>
        </section>
      ) : item ? (
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <ReasonChips item={item} />
            <span className="text-xs text-muted-foreground">
              {total - open.length + 1} of {total}
            </span>
          </div>
          <h1 className="font-heading text-2xl font-semibold">{question(item)}</h1>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl bg-muted/50 p-4">
              <RequestSide item={item} />
            </div>
            <div className="rounded-xl border p-4">
              <ProblemSide problem={item.compared} item={item} />
            </div>
          </div>
          <MatcherLine item={item} />
          <VerdictPanel
            key={item.id}
            item={item}
            problems={data.problems}
            onDone={(o) => {
              record(item.id, o);
              if (o.verdict !== "confirm") setSuggestion({ item, o });
            }}
          />
        </section>
      ) : (
        <section className="space-y-2 rounded-xl border p-6 text-center">
          <p className="font-heading text-xl font-semibold">Queue clear</p>
          <p className="text-sm text-muted-foreground">
            {data.notEscalated.length} Auto-accepted decisions stand. Review any of them from the Problem page.
          </p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="font-heading text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

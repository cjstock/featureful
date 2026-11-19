"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { reviewMatch, type MatchReviewInput } from "@/app/actions/match-review";
import type { Verdict } from "@/db/schema";
import { isTypingTarget, keepDone, keyCommand, moveSelection, nextOpenId } from "@/lib/inbox-navigation";
import { groupInbox, type VerdictOption } from "@/lib/review-inbox";
import type { ComparedProblem, InboxItem } from "@/lib/review-inbox-data";
import { confidenceTone, escalationReasonTone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { AiCallLine } from "@/components/ai-call-line";
import { badgeVariants, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VerdictForm } from "@/components/verdict-form";

type ProblemOption = { id: number; title: string };

/** A verdict saved this session: the item stays in the list, struck through. */
type Done = { item: InboxItem; label: string; regressionCase: boolean };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/**
 * PM only: the Escalation inbox. The queue grouped by strongest Escalation reason on the left,
 * the selected decision on the right. `j`/`k` move, `1`/`2`/`3` pick a verdict (Confirm saves at
 * once; Move and Split open the form), and saving moves on to the next open item.
 */
export function EscalationInbox({ items, problems }: { items: InboxItem[]; problems: ProblemOption[] }) {
  const router = useRouter();
  const [done, setDone] = useState<Map<number, Done>>(new Map());
  const [selected, setSelected] = useState<number | null>(null);
  const [form, setForm] = useState<"move" | "split" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const groups = groupInbox(keepDone(items, [...done.values()].map((d) => d.item)));
  const order = groups.flatMap((g) => g.items.map((i) => i.id));
  const selectedId = selected !== null && order.includes(selected) ? selected : (order[0] ?? null);
  const item = groups.flatMap((g) => g.items).find((i) => i.id === selectedId) ?? null;
  const openCount = order.filter((id) => !done.has(id)).length;

  const select = (id: number | null) => {
    setSelected(id);
    setForm(null);
    setError(null);
  };

  const save = (target: InboxItem, option: VerdictOption, input: MatchReviewInput) => {
    if (saving) return;
    startSave(async () => {
      setError(null);
      const result = await reviewMatch(target.id, input);
      if (!result.ok) return setError(result.error);
      const regressionCase = input.verdict !== "confirm" && input.regressionCase !== false;
      const next = new Map(done).set(target.id, { item: target, label: option.label, regressionCase });
      setDone(next);
      select(nextOpenId(order, target.id, new Set(next.keys())) ?? target.id);
      router.refresh();
    });
  };

  const pick = (option: VerdictOption) => {
    if (!item || done.has(item.id) || saving) return;
    setError(null);
    if (option.verdict === "confirm") return save(item, option, { verdict: "confirm" });
    setForm(option.verdict);
  };

  // Keep the latest handlers for the one window listener.
  const keys = useRef({ order, selectedId, item, pick, select });
  useEffect(() => {
    keys.current = { order, selectedId, item, pick, select };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const command = keyCommand(event, isTypingTarget(event.target as HTMLElement | null));
      if (!command) return;
      const { order, selectedId, item, pick, select } = keys.current;
      event.preventDefault();
      if (command.type === "move") return select(moveSelection(order, selectedId, command.delta));
      const option = item?.card.verdicts[command.index];
      if (option) pick(option);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectedRow = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  if (order.length === 0) {
    return <p className="text-sm text-muted-foreground">No Matching decisions waiting for review.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {openCount} open · <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> to move ·{" "}
        <kbd className="font-mono">1</kbd>/<kbd className="font-mono">2</kbd>/<kbd className="font-mono">3</kbd> to
        pick a verdict
      </p>
      <div className="grid gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
        <nav
          aria-label="Match review queue"
          className="max-h-[70vh] space-y-3 overflow-y-auto rounded-xl border p-2 text-sm"
        >
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h2 className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">
                {group.label} ({group.items.length})
              </h2>
              <ul>
                {group.items.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      ref={i.id === selectedId ? selectedRow : undefined}
                      onClick={() => select(i.id)}
                      aria-current={i.id === selectedId ? "true" : undefined}
                      className={cn(
                        "block w-full truncate rounded-md px-2 py-1 text-left hover:bg-muted/60",
                        i.id === selectedId && "bg-muted font-medium",
                        group.key === "not_escalated" && "text-muted-foreground",
                        done.has(i.id) && "text-muted-foreground line-through",
                      )}
                    >
                      {i.request.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        {item && (
          <DecisionDetail
            key={item.id}
            item={item}
            done={done.get(item.id) ?? null}
            form={form}
            problems={problems}
            saving={saving}
            error={error}
            onPick={pick}
            onSubmit={(input) => {
              const option = item.card.verdicts.find((v) => v.verdict === input.verdict);
              if (option) save(item, option, input);
            }}
            onCancel={() => {
              setForm(null);
              setError(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function DecisionDetail({
  item,
  done,
  form,
  problems,
  saving,
  error,
  onPick,
  onSubmit,
  onCancel,
}: {
  item: InboxItem;
  done: Done | null;
  form: "move" | "split" | null;
  problems: ProblemOption[];
  saving: boolean;
  error: string | null;
  onPick: (option: VerdictOption) => void;
  onSubmit: (input: MatchReviewInput) => void;
  onCancel: () => void;
}) {
  const formOption = form && item.card.verdicts.find((v) => v.verdict === form);
  return (
    <section aria-label="Matching decision" className="min-w-0 space-y-4 rounded-xl border p-4">
      {item.reasons.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Escalation reasons">
          {item.reasons.map((r) => (
            <li key={r.reason}>
              <Tooltip>
                <TooltipTrigger
                  aria-label={`${r.label}: ${r.detail}`}
                  className={cn(badgeVariants({ tone: escalationReasonTone(r.reason) }), "cursor-help")}
                >
                  {r.label}
                </TooltipTrigger>
                <TooltipContent>{r.detail}</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      ) : (
        <Badge tone="neutral">Auto-accepted</Badge>
      )}

      <h2 className="font-heading text-lg font-semibold">{item.card.question}</h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <RequestSide item={item} />
        <ProblemSide item={item} compared={item.compared} />
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {item.match ? (
          <p>
            Matcher: “{item.match.reason}”{" "}
            <Badge tone={confidenceTone(item.match.confidence)}>{Math.round(item.match.confidence * 100)}% confident</Badge>
          </p>
        ) : item.matcherOutcome === "ok" ? (
          <p>
            Matcher proposed a new Problem: “{item.newProblem.title}”
            {item.closestConfidence !== null && <> · runner-up at {Math.round(item.closestConfidence * 100)}%</>}
          </p>
        ) : null}
        {item.aiCall && <AiCallLine aiCall={item.aiCall} />}
      </div>

      {done ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="positive">Saved: {done.label}</Badge>
          {done.regressionCase && <Badge tone="info">Regression case</Badge>}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Verdict">
            {item.card.verdicts.map((option, i) => (
              <Button
                key={option.verdict}
                size="sm"
                variant={form === option.verdict || (option.verdict === "confirm" && !form) ? "default" : "outline"}
                disabled={saving}
                onClick={() => onPick(option)}
              >
                {saving && option.verdict === "confirm" && !form ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <kbd className="font-mono text-[10px] opacity-60">{i + 1}</kbd>
                )}
                {option.label}
              </Button>
            ))}
          </div>
          {formOption && (
            <VerdictForm
              key={formOption.verdict}
              verdict={formOption.verdict as Exclude<Verdict, "confirm">}
              submitLabel={formOption.verdict === "move" ? "Move Request" : "Split into new Problem"}
              currentProblemId={item.currentProblem.id}
              moveTarget={item.card.moveTarget}
              problems={problems}
              newProblem={item.newProblem}
              saving={saving}
              error={error}
              onSubmit={onSubmit}
              onCancel={onCancel}
            />
          )}
          {!formOption && error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function SideLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs tracking-wide text-muted-foreground uppercase">{children}</p>;
}

function RequestSide({ item }: { item: InboxItem }) {
  return (
    <div className="min-w-0 space-y-1 rounded-lg bg-muted/50 p-3">
      <SideLabel>
        New Request · {item.submitterName} · {dateFormat.format(item.createdAt)}
      </SideLabel>
      <p className="font-medium">{item.request.title}</p>
      <p className="text-sm whitespace-pre-wrap">{item.request.description}</p>
      <p className="text-xs text-muted-foreground">
        Now on{" "}
        <Link href={`/problems/${item.currentProblem.id}`} className="underline-offset-2 hover:underline">
          {item.currentProblem.title}
        </Link>
      </p>
    </div>
  );
}

function ProblemSide({ item, compared }: { item: InboxItem; compared: ComparedProblem | null }) {
  if (!compared) {
    return (
      <div className="min-w-0 space-y-1 rounded-lg border p-3 text-sm text-muted-foreground">
        <SideLabel>Compared Problem</SideLabel>
        <p>
          {item.matcherOutcome !== "ok"
            ? "The Matcher didn't run. Move the Request to an existing Problem, or keep it as its own."
            : "The Matcher named no existing Problem close to this one."}
        </p>
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-2 rounded-lg border p-3">
      <SideLabel>
        {compared.role === "match" ? "Matched Problem" : "Runner-up Problem"} ·{" "}
        {compared.supporters === 1 ? "1 supporter" : `${compared.supporters} supporters`}
      </SideLabel>
      <Link href={`/problems/${compared.id}`} className="font-medium underline-offset-2 hover:underline">
        {compared.title}
      </Link>
      <p className="text-sm">{compared.need}</p>
      {compared.evidence.length > 0 ? (
        <ul aria-label="Evidence" className="space-y-1 border-l-2 pl-3 text-xs text-muted-foreground">
          {compared.evidence.map((e) => (
            <li key={e.requestId}>
              <span className="font-medium text-foreground">{e.title}</span> ({e.authorName}): {e.excerpt}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No other Evidence yet.</p>
      )}
    </div>
  );
}

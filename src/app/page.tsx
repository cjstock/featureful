import Link from "next/link";
import { getDb } from "@/db/client";
import { getCurrentPerson } from "@/lib/identity";
import { isInternalStakeholder, isPm } from "@/lib/roles";
import { ReevaluateButton } from "@/components/reevaluate-button";
import { listProblems, parseProblemQuery, type ProblemListItem } from "@/lib/problems";
import { cn } from "@/lib/utils";
import { NotEvaluatedBadge, OverrideBadge, ScoreChip } from "@/components/score-chip";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProblemFilters } from "@/components/problem-filters";
import { StatusBadge, statusEdgeClass } from "@/components/status-badge";
import { SupportButton } from "@/components/support-button";
import { supporterLabel } from "@/components/supporter-count";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const person = await getCurrentPerson();
  const query = parseProblemQuery(await searchParams);
  const internal = isInternalStakeholder(person);
  const onlySupported = !internal && query.onlySupported;
  const sort = query.sort ?? "priority";
  const items = listProblems(getDb(), { ...query, sort, onlySupported, viewerId: person.id });
  const filtered = Boolean(query.q || query.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Problems</h1>
          <p className="text-muted-foreground">
            {internal
              ? "Every Problem with its Priority score, Demand and Evidence."
              : "What people have asked for. Support the Problems that matter to you."}
          </p>
        </div>
        {isPm(person) && items.length > 0 && <ReevaluateButton />}
      </div>

      {!internal && <CustomerTabs onlySupported={onlySupported} />}

      <ProblemFilters
        q={query.q}
        status={query.status}
        sort={sort}
        view={onlySupported ? "supported" : undefined}
      />

      {items.length === 0 ? (
        <EmptyState filtered={filtered} onlySupported={onlySupported} />
      ) : internal ? (
        <InternalList items={items} />
      ) : (
        <CustomerList items={items} />
      )}
    </div>
  );
}

function CustomerTabs({ onlySupported }: { onlySupported: boolean }) {
  const tab = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium",
      active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <nav className="flex gap-1" aria-label="Problem views">
      <Link href="/" className={tab(!onlySupported)} aria-current={!onlySupported ? "page" : undefined}>
        All Problems
      </Link>
      <Link
        href="/?view=supported"
        className={tab(onlySupported)}
        aria-current={onlySupported ? "page" : undefined}
      >
        Problems I support
      </Link>
    </nav>
  );
}

function EmptyState({ filtered, onlySupported }: { filtered: boolean; onlySupported: boolean }) {
  const [title, body] = filtered
    ? ["No matching Problems", "Try a different keyword or Status."]
    : onlySupported
      ? ["You don't support any Problems yet", "Support a Problem to follow it here."]
      : ["No Problems yet", "Problems appear here once someone submits a Request."];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function CustomerList({ items }: { items: ProblemListItem[] }) {
  return (
    <ul className="space-y-3">
      {items.map(({ problem, supporterCount, supportedByViewer }) => (
        <li key={problem.id}>
          <Card className={statusEdgeClass(problem.status)}>
            <div className="space-y-3 px-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`/problems/${problem.id}`} className="font-medium hover:underline">
                  {problem.title}
                </Link>
                <StatusBadge status={problem.status} />
              </div>
              <p className="text-sm text-muted-foreground">{problem.need}</p>
              {problem.decisionNote && (
                <p className="rounded-md border-l-2 bg-muted/50 px-3 py-2 text-sm">
                  <span className="font-medium">Decision note: </span>
                  {problem.decisionNote}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-primary">{supporterLabel(supporterCount)}</span>
                <SupportButton problemId={problem.id} supported={supportedByViewer} />
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function InternalList({ items }: { items: ProblemListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Priority</th>
            <th className="px-3 py-2 font-medium">Problem</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Supporters</th>
            <th className="px-3 py-2 text-right font-medium">Evidence</th>
            <th className="px-3 py-2 font-medium">
              <span className="sr-only">Your Support</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ problem, supporterCount, evidenceCount, priority, supportedByViewer }) => (
            <tr key={problem.id} className="border-t align-top">
              <td className={cn("px-3 py-2", statusEdgeClass(problem.status))}>
                <ScoreChip priority={priority} />
                {priority.overridden && (
                  <div className="mt-1 space-y-0.5">
                    <OverrideBadge note={problem.overrideNote} />
                    <div className="text-xs whitespace-nowrap text-muted-foreground">
                      Computed {priority.computedTotal}
                    </div>
                  </div>
                )}
                {!priority.evaluated && (
                  <div className="mt-1">
                    <NotEvaluatedBadge />
                  </div>
                )}
              </td>
              <td className="px-3 py-2">
                <Link href={`/problems/${problem.id}`} className="font-medium hover:underline">
                  {problem.title}
                </Link>
                <p className="line-clamp-2 text-muted-foreground">{problem.need}</p>
                {problem.decisionNote && (
                  <p className="mt-1 line-clamp-1 text-xs" title={problem.decisionNote}>
                    <span className="font-medium">Decision note: </span>
                    {problem.decisionNote}
                  </p>
                )}
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={problem.status} />
              </td>
              <td className="px-3 py-2 text-right font-semibold text-primary tabular-nums">{supporterCount}</td>
              <td className="px-3 py-2 text-right tabular-nums">{evidenceCount}</td>
              <td className="px-3 py-2 text-right">
                <SupportButton problemId={problem.id} supported={supportedByViewer} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

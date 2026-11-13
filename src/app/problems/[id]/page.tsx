import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getCurrentPerson } from "@/lib/identity";
import { isInternalStakeholder, ROLE_LABELS } from "@/lib/roles";
import { getProblem, listEvidence } from "@/lib/problems";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { SupportButton } from "@/components/support-button";
import { supporterLabel } from "@/components/supporter-count";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default async function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const detail = getProblem(db, id);
  if (!detail) notFound();

  const person = await getCurrentPerson();
  const internal = isInternalStakeholder(person);
  const { problem, supporters, priority } = detail;
  // Customers only ever see their own Requests; never other Customers' words, scores or briefs.
  const evidence = listEvidence(db, id, internal ? undefined : person.id);
  const supportedByMe = supporters.some((s) => s.id === person.id);

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← All Problems
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={problem.status} />
          <span className="text-sm text-muted-foreground">{supporterLabel(supporters.length)}</span>
        </div>
        <h1 className="font-heading text-2xl font-semibold">{problem.title}</h1>
        <p className="text-muted-foreground">{problem.need}</p>
        {person.role === "customer" && (
          <SupportButton problemId={problem.id} supported={supportedByMe} size="default" />
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Decision note</CardTitle>
          <CardDescription>
            {problem.decisionNote ?? "No decision yet. Supporters will see the PM's note here."}
          </CardDescription>
        </CardHeader>
      </Card>

      {internal && (
        <Card>
          <CardHeader>
            <CardTitle>Priority score</CardTitle>
            <CardDescription>Demand is computed live from the supporter count.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-baseline gap-3">
            <span className="text-3xl font-semibold tabular-nums">{priority.total}</span>
            {priority.overridden && (
              <span className="text-sm text-muted-foreground">
                Overridden (computed {priority.computedTotal})
                {problem.overrideNote ? `: ${problem.overrideNote}` : ""}
              </span>
            )}
            {!priority.evaluated && <Badge variant="outline">Not evaluated</Badge>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{internal ? `Evidence (${evidence.length})` : "Your Requests"}</CardTitle>
          <CardDescription>
            {internal
              ? "Every Request attached to this Problem, in the submitter's own words."
              : "Requests you submitted that are attached to this Problem. Other people's Requests stay private."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {evidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {internal ? "No Evidence yet." : "You haven't submitted a Request for this Problem."}
            </p>
          ) : (
            <ul className="space-y-4">
              {evidence.map(({ request, author }) => (
                <li key={request.id} className="space-y-1 border-l-2 pl-3">
                  <p className="font-medium">{request.title}</p>
                  <p className="whitespace-pre-wrap text-sm">{request.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {internal && `${author.name} (${ROLE_LABELS[author.role]}) · `}
                    {dateFormat.format(request.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {internal && (
        <Card>
          <CardHeader>
            <CardTitle>Supporters ({supporters.length})</CardTitle>
            <CardDescription>People who have given this Problem their Support.</CardDescription>
          </CardHeader>
          <CardContent>
            {supporters.length === 0 ? (
              <p className="text-sm text-muted-foreground">No supporters yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {supporters.map((s) => (
                  <li key={s.id}>
                    <Badge variant="secondary">
                      {s.name} · {ROLE_LABELS[s.role]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

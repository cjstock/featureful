import Link from "next/link";
import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { problems } from "@/db/schema";
import { getCurrentPerson } from "@/lib/identity";
import { isPm } from "@/lib/roles";
import { getMatchReview } from "@/lib/match-review-app";
import {
  SUBMITTER_CHOICE_LABELS,
  VERDICT_LABELS,
  type MatchingDecisionItem,
} from "@/lib/match-review";
import { ESCALATION_REASON_LABELS, MATCHER_OUTCOME_LABELS } from "@/lib/escalation-labels";
import { confidenceTone, escalationReasonTone, verdictTone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { TONE_STYLES } from "@/components/tone-styles";
import { AiCallLine } from "@/components/ai-call-line";
import { MatchReviewControls } from "@/components/match-review-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });


export const metadata = { title: "Match review · Featureful" };

type Tab = "escalations" | "not-escalated" | "reviewed";

const EMPTY: Record<Tab, string> = {
  escalations: "No Escalations to review.",
  "not-escalated": "No Auto-accepted decisions waiting.",
  reviewed: "No Matching decisions reviewed yet.",
};

/**
 * PM-only Match review: the Escalation queue (ranked by strongest reason, then oldest first),
 * the Auto-accepted decisions ("Not escalated", still reviewable), and the reviewed ones.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const person = await getCurrentPerson();
  if (!isPm(person)) notFound();
  const requested = (await searchParams).tab;
  const tab: Tab = requested === "reviewed" || requested === "not-escalated" ? requested : "escalations";
  const reviewedTab = tab === "reviewed";
  const review = getMatchReview();
  const queueCount = review.countQueue();
  const items =
    tab === "reviewed" ? review.listReviewed() : tab === "not-escalated" ? review.listNotEscalated() : review.listQueue();
  const problemOptions = reviewedTab
    ? []
    : getDb()
        .select({ id: problems.id, title: problems.title })
        .from(problems)
        .orderBy(asc(problems.title))
        .all();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Match review</h1>
        <p className="text-muted-foreground">
          Escalations are the Matching decisions that need a look, strongest reason first. The rest
          are Auto-accepted: they stand unless you review them.
        </p>
      </div>

      <Tabs tab={tab} queueCount={queueCount} />

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{EMPTY[tab]}</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.id}>
              <DecisionCard item={item} problems={problemOptions} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tabs({ tab, queueCount }: { tab: Tab; queueCount: number }) {
  const link = (value: Tab, href: string, label: React.ReactNode) => (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
        tab === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
      aria-current={tab === value ? "page" : undefined}
    >
      {label}
    </Link>
  );
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Match review views">
      {link("escalations", "/review", <>Escalations <Badge variant="secondary">{queueCount}</Badge></>)}
      {link("not-escalated", "/review?tab=not-escalated", "Not escalated")}
      {link("reviewed", "/review?tab=reviewed", "Reviewed")}
    </nav>
  );
}

function ProblemLink({ problem }: { problem: { id: number; title: string } | null }) {
  if (!problem) return <span className="text-muted-foreground">a deleted Problem</span>;
  return (
    <Link href={`/problems/${problem.id}`} className="font-medium hover:underline">
      {problem.title}
    </Link>
  );
}

function DecisionCard({
  item,
  problems,
}: {
  item: MatchingDecisionItem;
  problems: { id: number; title: string }[];
}) {
  const { request, submitter, proposal, review } = item;
  const { match } = proposal;
  // "Mine is different": the submitter rejected the proposed match, the most telling decisions.
  const differs = item.submitterChoice === "rejected";
  return (
    <Card className={cn(differs && ["border-l-4", TONE_STYLES.caution.edge])}>
      <CardHeader>
        <CardTitle>{request.title}</CardTitle>
        <CardDescription>
          {submitter.name} · {dateFormat.format(item.createdAt)}
        </CardDescription>
        {item.escalationReasons.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Escalation reasons">
            {item.escalationReasons.map((reason) => (
              <li key={reason}>
                <Badge tone={escalationReasonTone(reason)}>{ESCALATION_REASON_LABELS[reason]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="whitespace-pre-wrap">{request.description}</p>

        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Matcher proposed</dt>
          <dd className="space-y-1">
            {match ? (
              <>
                <p>
                  Match:{" "}
                  <ProblemLink
                    problem={
                      match.problemId !== null && match.problemTitle !== null
                        ? { id: match.problemId, title: match.problemTitle }
                        : null
                    }
                  />{" "}
                  <Badge tone={confidenceTone(match.confidence)}>
                    {Math.round(match.confidence * 100)}% confident
                  </Badge>
                </p>
                <p className="text-muted-foreground">{match.reason}</p>
              </>
            ) : (
              <>
                {item.matcherOutcome !== "ok" && (
                  <p className="text-muted-foreground">
                    The Matcher was bypassed ({MATCHER_OUTCOME_LABELS[item.matcherOutcome]}). Group
                    this Request: move it to an existing Problem, or confirm where it is.
                  </p>
                )}
                <p>
                  New Problem: <span className="font-medium">{proposal.newProblem.title}</span>
                </p>
                <p className="text-muted-foreground">{proposal.newProblem.need}</p>
                {proposal.closestProblem && (
                  <p>
                    Closest:{" "}
                    <ProblemLink
                      problem={
                        proposal.closestProblem.problemId !== null && proposal.closestProblem.problemTitle !== null
                          ? { id: proposal.closestProblem.problemId, title: proposal.closestProblem.problemTitle }
                          : null
                      }
                    />{" "}
                    <Badge tone="neutral">{Math.round(proposal.closestProblem.confidence * 100)}% confident</Badge>
                  </p>
                )}
              </>
            )}
            {item.aiCall && <AiCallLine aiCall={item.aiCall} />}
          </dd>

          <dt className="text-muted-foreground">Submitter chose</dt>
          <dd>
            {differs ? (
              <Badge tone="caution" className="h-auto whitespace-normal">
                {SUBMITTER_CHOICE_LABELS[item.submitterChoice]}
              </Badge>
            ) : (
              SUBMITTER_CHOICE_LABELS[item.submitterChoice]
            )}
          </dd>

          <dt className="text-muted-foreground">Current Problem</dt>
          <dd>
            <ProblemLink problem={item.currentProblem} />
          </dd>

          {review && (
            <>
              <dt className="text-muted-foreground">Match review</dt>
              <dd className="space-y-1">
                <p>
                  <Badge tone={verdictTone(review.verdict)}>{VERDICT_LABELS[review.verdict]}</Badge>
                  {review.verdict !== "confirm" && (
                    <>
                      {" "}
                      from <ProblemLink problem={review.fromProblem} /> to{" "}
                      <ProblemLink problem={review.toProblem} />
                    </>
                  )}
                </p>
                {review.note && <p className="whitespace-pre-wrap">{review.note}</p>}
                {item.regressionCase && <Badge tone="info">Regression case</Badge>}
                <p className="text-muted-foreground">
                  {review.reviewer?.name ?? "A PM"}
                  {review.reviewedAt && ` · ${dateFormat.format(review.reviewedAt)}`}
                </p>
              </dd>
            </>
          )}
        </dl>

        {!review && (
          <MatchReviewControls
            decisionId={item.id}
            currentProblemId={item.currentProblem.id}
            problems={problems}
            newProblem={proposal.newProblem}
          />
        )}
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/** Reviewed Matching decisions, most recently reviewed first, each with its verdict and note. */
export function ReviewedList({ items }: { items: MatchingDecisionItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No Matching decisions reviewed yet.</p>;
  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.id}>
          <ReviewedCard item={item} />
        </li>
      ))}
    </ul>
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

function ReviewedCard({ item }: { item: MatchingDecisionItem }) {
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

      </CardContent>
    </Card>
  );
}

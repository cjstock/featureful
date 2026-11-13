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
import { confidenceTone, verdictTone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { TONE_STYLES } from "@/components/tone-styles";
import { MatchReviewControls } from "@/components/match-review-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export const metadata = { title: "Match review · Featureful" };

/** PM-only queue of Matching decisions: "To review" and "Reviewed". */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const person = await getCurrentPerson();
  if (!isPm(person)) notFound();
  const reviewedTab = (await searchParams).tab === "reviewed";
  const review = getMatchReview();
  const queueCount = review.countQueue();
  const items = reviewedTab ? review.listReviewed() : review.listQueue();
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
          What the Matcher proposed for each Request and what the submitter chose. Reviewed
          decisions become Matching examples.
        </p>
      </div>

      <Tabs reviewed={reviewedTab} queueCount={queueCount} />

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {reviewedTab ? "No Matching decisions reviewed yet." : "Nothing to review."}
        </p>
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

function Tabs({ reviewed, queueCount }: { reviewed: boolean; queueCount: number }) {
  const tab = (active: boolean) =>
    cn(
      "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
      active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <nav className="flex gap-1" aria-label="Match review views">
      <Link href="/review" className={tab(!reviewed)} aria-current={!reviewed ? "page" : undefined}>
        To review <Badge variant="secondary">{queueCount}</Badge>
      </Link>
      <Link
        href="/review?tab=reviewed"
        className={tab(reviewed)}
        aria-current={reviewed ? "page" : undefined}
      >
        Reviewed
      </Link>
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
                <p>
                  New Problem: <span className="font-medium">{proposal.newProblem.title}</span>
                </p>
                <p className="text-muted-foreground">{proposal.newProblem.need}</p>
              </>
            )}
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

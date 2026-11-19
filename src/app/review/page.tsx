import Link from "next/link";
import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { problems } from "@/db/schema";
import { getCurrentPerson } from "@/lib/identity";
import { isPm } from "@/lib/roles";
import { getMatchReview } from "@/lib/match-review-app";
import { loadInbox } from "@/lib/review-inbox-data";
import { cn } from "@/lib/utils";
import { AiBudgetBanner } from "@/components/ai-budget-banner";
import { EscalationInbox } from "@/components/escalation-inbox";
import { InboxMetrics } from "@/components/inbox-metrics";
import { Badge } from "@/components/ui/badge";
import { ReviewedList } from "./reviewed-list";

export const metadata = { title: "Match review · Featureful" };

type View = "inbox" | "reviewed";

/**
 * PM-only Match review. The inbox: every unreviewed Matching decision, the Escalations grouped by
 * strongest reason and the Auto-accepted ones last ("Not escalated", still reviewable). The
 * Reviewed view lists past verdicts.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const person = await getCurrentPerson();
  if (!isPm(person)) notFound();
  const view: View = (await searchParams).tab === "reviewed" ? "reviewed" : "inbox";
  const db = getDb();
  const review = getMatchReview();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Match review</h1>
        <p className="text-muted-foreground">
          Escalations are the Matching decisions that need a look, strongest reason first. The rest are
          Auto-accepted: they stand unless you review them.
        </p>
      </div>

      <Views view={view} queueCount={review.countQueue()} />

      {view === "reviewed" ? (
        <ReviewedList items={review.listReviewed()} />
      ) : (
        <>
          <InboxMetrics />
          <AiBudgetBanner />
          <EscalationInbox
            items={loadInbox(db, review)}
            problems={db.select({ id: problems.id, title: problems.title }).from(problems).orderBy(asc(problems.title)).all()}
          />
        </>
      )}
    </div>
  );
}

function Views({ view, queueCount }: { view: View; queueCount: number }) {
  const link = (value: View, href: string, label: React.ReactNode) => (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
        view === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
      aria-current={view === value ? "page" : undefined}
    >
      {label}
    </Link>
  );
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Match review views">
      {link("inbox", "/review", <>Inbox <Badge variant="secondary">{queueCount}</Badge></>)}
      {link("reviewed", "/review?tab=reviewed", "Reviewed")}
    </nav>
  );
}

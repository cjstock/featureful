import { Info } from "lucide-react";
import { getDb } from "@/db/client";
import type { Db } from "@/db";
import { ESCALATION_REASON_LABELS } from "@/lib/escalation-labels";
import {
  agreementRates,
  costPerRequest,
  decisionNoteShare,
  escalationRate,
  formatPercent,
  formatShare,
  readEvalBaseline,
  refusalsToday,
  regressionCasesMarked,
  REVIEW_METRICS,
  spendToday,
  timeToDecision,
  tooFew,
} from "@/lib/review-metrics";
import { cn } from "@/lib/utils";
import { TONE_STYLES } from "@/components/tone-styles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const { agreementWindow, escalationRateDays, regressionDays, costPerRequestDays } = REVIEW_METRICS;

const usd = (amount: number) => `$${amount.toFixed(amount > 0 && amount < 1 ? 3 : 2)}`;

function loadMetrics(db: Db, now: Date) {
  const agreement = agreementRates(db);
  return {
    agreement: agreement.spotCheck,
    escalation: escalationRate(db, now),
    regression: regressionCasesMarked(db, now),
    escalationAgreement: agreement.escalation,
    spend: spendToday(db, now),
    cost: costPerRequest(db, now),
    refused: refusalsToday(db, now),
    baseline: readEvalBaseline(),
    timing: timeToDecision(db),
    notes: decisionNoteShare(db),
  };
}

/**
 * The /review metrics (PM-only, like the page): a header strip with the PM agreement rate,
 * Escalation rate and Regression cases marked, and a "Details" disclosure with the rest. Every
 * stat shows its n, its window, and what it can't tell you (a tooltip). It has no role guard of its
 * own: it relies on `/review`'s PM-only guard, so render it only there.
 */
export function InboxMetrics() {
  let m: ReturnType<typeof loadMetrics>;
  try {
    m = loadMetrics(getDb(), new Date());
  } catch (error) {
    console.error("Couldn't load the /review metrics", error);
    return (
      <p role="status" className={cn("rounded-lg px-4 py-3 text-sm font-medium", TONE_STYLES.negative.badge)}>
        Metrics unavailable right now.
      </p>
    );
  }
  const { agreement, escalation, regression, escalationAgreement, spend, cost, refused, baseline, timing, notes } = m;

  return (
    <section aria-label="Match review metrics" className="space-y-2">
      <dl className="grid gap-2 sm:grid-cols-3">
        <Stat
          label="PM agreement rate"
          value={formatShare(agreement)}
          context={`n = ${agreement.n} · last ${agreementWindow} reviewed spot checks`}
          cantTell="Spot-check agreement can't see wrong matches the submitter accepted and nobody reviewed."
        />
        <Stat
          label="Escalation rate"
          value={formatShare(escalation)}
          context={`${escalation.count} of n = ${escalation.n} Matching decisions · last ${escalationRateDays} days`}
          cantTell="It can't tell you whether escalated decisions were wrong; it's information, not a target."
        />
        <Stat
          label="Regression cases"
          value={`${regression.marked} marked`}
          context={`of ${regression.corrections} Move/Split reviews · last ${regressionDays} days`}
          cantTell="Marked in the app only: it can't see whether they were exported with eval:pull or committed."
        />
      </dl>

      <details className="rounded-lg border">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          Details
        </summary>
        <dl className="grid gap-2 border-t p-2 sm:grid-cols-2 lg:grid-cols-3">
          <Stat
            label="Escalation agreement"
            value={formatShare(escalationAgreement)}
            context={`n = ${escalationAgreement.n} · last ${agreementWindow} reviewed Escalations (not spot checks)`}
            cantTell="Escalations are hard cases by design, so this runs lower than spot-check agreement and isn't the Matcher's accuracy."
          />
          <Stat
            label="AI spend today"
            value={spend.ok ? `${usd(spend.spentUsd)} of ${usd(spend.budgetUsd)}` : "Budget misconfigured"}
            context="App AI calls · today (UTC), resets 00:00 UTC"
            cantTell="Counts app AI calls only, not seed or eval runs or anything billed outside the app."
          >
            {spend.ok && <SpendBar spentUsd={spend.spentUsd} budgetUsd={spend.budgetUsd} />}
          </Stat>
          <Stat
            label="Cost per Request"
            value={cost.value === null ? tooFew(cost.n) : usd(cost.value)}
            context={`n = ${cost.n} Requests (${usd(cost.totalUsd)} in all) · last ${costPerRequestDays} days`}
            cantTell="Includes seed AI calls (spend is app only); Evaluator calls count per Problem, so unrelated re-evaluations count and unsubmitted previews don't."
          />
          <Stat
            label="Refused AI calls today"
            value={`${refused.budget + refused.off}`}
            context={`${refused.budget} over budget · ${refused.off} switched off · today (UTC)`}
            cantTell="It can't tell you what the refused calls would have decided, or who gave up after one."
          />
          <Stat
            label="Eval baseline"
            value={baseline ? `F1 ${baseline.f1.toFixed(2)} · cases ${formatPercent(baseline.caseAccuracy)}` : "No baseline"}
            context={
              baseline
                ? `Last committed eval (not production) · commit ${baseline.commit.slice(0, 7)}, ${baseline.date.toISOString().slice(0, 10)}`
                : "Last committed eval (not production) · evals/baseline.json missing or unreadable"
            }
            cantTell="A fixed golden set replayed offline: it can't tell you how the Matcher does on today's Requests."
          />
          <Stat
            label="Time to decision"
            value={timing.medianDays === null ? tooFew(timing.n) : `${timing.medianDays.toFixed(1)} days (median)`}
            context={`n = ${timing.n} Problems with a recorded first decision · all time${timing.untimed ? ` (${timing.untimed} decided before it was recorded)` : ""}`}
            cantTell="Problems decided before this was recorded aren't counted, and it can't tell you whether the decision was right."
          />
          <Stat
            label="Decision notes"
            value={formatShare(notes)}
            context={`${notes.count} of n = ${notes.n} decided Problems have one · all time`}
            cantTell="It can't tell you whether a note is any good, or whether Customers read it."
          />
          <div className="min-w-0 rounded-lg bg-muted/40 p-3 sm:col-span-2">
            <dt className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              Escalation reasons · last {escalationRateDays} days (n = {escalation.n})
              <CantTell text="A decision can have several reasons, so counts overlap; it can't tell you which reasons catch real mistakes." />
            </dt>
            <dd className="mt-1">
              {escalation.reasons.length === 0 ? (
                <span className="text-sm text-muted-foreground">No Escalations in this window.</span>
              ) : (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {escalation.reasons.map((r) => (
                    <li key={r.reason}>
                      {ESCALATION_REASON_LABELS[r.reason]} <span className="font-semibold tabular-nums">{r.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </details>
    </section>
  );
}

function Stat({
  label,
  value,
  context,
  cantTell,
  children,
}: {
  label: string;
  value: string;
  /** Its n and its window. */
  context: string;
  /** One line: what this number can't tell you. */
  cantTell: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 p-3">
      <dt className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {label}
        <CantTell text={cantTell} />
      </dt>
      <dd className="mt-1 space-y-1">
        <div className="text-lg font-semibold tabular-nums">{value}</div>
        {children}
        <div className="text-xs text-muted-foreground">{context}</div>
      </dd>
    </div>
  );
}

/** The one-line "what this can't tell you" tooltip on a stat. */
function CantTell({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger aria-label={`What this can't tell you: ${text}`} className="cursor-help rounded-sm">
        <Info className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

/** Today's app spend against the daily budget, as a bar. */
function SpendBar({ spentUsd, budgetUsd }: { spentUsd: number; budgetUsd: number }) {
  const share = budgetUsd > 0 ? Math.min(1, spentUsd / budgetUsd) : 1;
  const tone = share >= 1 ? "negative" : share >= 0.8 ? "caution" : "positive";
  return (
    <div
      role="meter"
      aria-label="AI spend today against the daily budget"
      aria-valuemin={0}
      aria-valuemax={budgetUsd}
      aria-valuenow={Math.min(spentUsd, budgetUsd)}
      className="h-2 overflow-hidden rounded-full bg-muted-foreground/20"
    >
      <div className={cn("h-full rounded-full", TONE_STYLES[tone].solid)} style={{ width: `${share * 100}%` }} />
    </div>
  );
}

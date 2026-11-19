import { and, asc, eq, gt } from "drizzle-orm";
import type { Db } from "@/db";
import { aiCalls, requests } from "@/db/schema";
import { PROPOSE_RATE_LIMIT, REQUEST_RATE_LIMIT, type RateLimit } from "@/lib/config";
import { formatUtcTime } from "@/lib/utc-time";

/**
 * Per-person rate limits on `/submit`, each over a rolling window: Request submissions
 * (`REQUEST_RATE_LIMIT`) and Matcher proposals (`PROPOSE_RATE_LIMIT`). Past a limit the action is
 * blocked until enough of the person's recent ones have left the window.
 */
export type RateLimitCheck = { ok: true } | { ok: false; retryAt: Date; message: string };

/**
 * Whether one more fits after `times` (ascending, all inside the window) plus `pending` ones not
 * recorded yet, and if not, from when.
 */
function check(
  times: Date[],
  { max, windowMs }: RateLimit,
  message: (retryAt: Date) => string,
  pending = 0,
): RateLimitCheck {
  if (times.length + pending < max) return { ok: true };
  // Once enough of the recorded ones have left the window, one more fits. Pending ones are
  // recorded when they finish, so they can only push that later; the time shown is the earliest.
  const leaving = times[Math.max(0, times.length + pending - max)] ?? times.at(-1);
  const retryAt = leaving ? new Date(leaving.getTime() + windowMs) : new Date(Date.now() + MINUTE_MS);
  return { ok: false, retryAt, message: message(retryAt) };
}

const MINUTE_MS = 60_000;

/** The retry time as HH:MM UTC, rounded up to the minute so trying at that minute works. */
const retryLabel = (retryAt: Date) =>
  `Try again at ${formatUtcTime(new Date(Math.ceil(retryAt.getTime() / MINUTE_MS) * MINUTE_MS))} UTC.`;

/** Whether `personId` may submit (save) another Request at `now`. */
export function checkSubmitRateLimit(db: Db, personId: number, now: Date): RateLimitCheck {
  const { max, windowMs } = REQUEST_RATE_LIMIT;
  const times = db
    .select({ at: requests.createdAt })
    .from(requests)
    .where(and(eq(requests.authorId, personId), gt(requests.createdAt, new Date(now.getTime() - windowMs))))
    .orderBy(asc(requests.createdAt))
    .all()
    .map((r) => r.at);
  return check(times, REQUEST_RATE_LIMIT, (retryAt) => `You've submitted ${max} Requests in the last hour. ${retryLabel(retryAt)}`);
}

/**
 * Whether `personId` may ask the Matcher for another proposal at `now`. Counts their app Matcher
 * AI calls in the window, whatever the outcome (refused ones too), plus `pending` proposals of
 * theirs still waiting on the Matcher (an AI call is recorded only when it finishes).
 */
export function checkProposeRateLimit(db: Db, personId: number, now: Date, pending = 0): RateLimitCheck {
  const { max, windowMs } = PROPOSE_RATE_LIMIT;
  const times = db
    .select({ at: aiCalls.time })
    .from(aiCalls)
    .where(
      and(
        eq(aiCalls.personId, personId),
        eq(aiCalls.source, "app"),
        eq(aiCalls.module, "matcher"),
        gt(aiCalls.time, new Date(now.getTime() - windowMs)),
      ),
    )
    .orderBy(asc(aiCalls.time))
    .all()
    .map((r) => r.at);
  return check(
    times,
    PROPOSE_RATE_LIMIT,
    (retryAt) => `You've checked ${max} Requests for matches in the last hour. ${retryLabel(retryAt)}`,
    pending,
  );
}

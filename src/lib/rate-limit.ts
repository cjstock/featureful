import { and, asc, eq, gt } from "drizzle-orm";
import type { Db } from "@/db";
import { requests } from "@/db/schema";
import { REQUEST_RATE_LIMIT } from "@/lib/config";

/**
 * The submit rate limit: a person may submit at most `REQUEST_RATE_LIMIT.max` Requests in any
 * rolling `REQUEST_RATE_LIMIT.windowMs`. Past that, the submission is blocked until the oldest
 * one in the window is old enough to leave it.
 */
export type RateLimitCheck = { ok: true } | { ok: false; retryAt: Date };

/** Whether `personId` may submit another Request at `now`, and if not, from when. */
export function checkSubmitRateLimit(db: Db, personId: number, now: Date): RateLimitCheck {
  const { max, windowMs } = REQUEST_RATE_LIMIT;
  const recent = db
    .select({ createdAt: requests.createdAt })
    .from(requests)
    .where(and(eq(requests.authorId, personId), gt(requests.createdAt, new Date(now.getTime() - windowMs))))
    .orderBy(asc(requests.createdAt))
    .all();
  if (recent.length < max) return { ok: true };
  // Once this many of the recent submissions have left the window, one more fits.
  const leaving = recent[recent.length - max];
  return { ok: false, retryAt: new Date(leaving.createdAt.getTime() + windowMs) };
}

const MINUTE_MS = 60_000;
const utcTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });

/** "You've submitted 10 Requests in the last hour. Try again at 15:05 UTC." (rounded up to the minute). */
export function rateLimitMessage(retryAt: Date): string {
  const minute = new Date(Math.ceil(retryAt.getTime() / MINUTE_MS) * MINUTE_MS);
  return `You've submitted ${REQUEST_RATE_LIMIT.max} Requests in the last hour. Try again at ${utcTime.format(minute)} UTC.`;
}

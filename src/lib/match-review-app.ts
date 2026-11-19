import { getDb } from "@/db/client";
import { createMatchReview } from "@/lib/match-review";

/** The app's Match review module (server only), wired to the app db. */
export function getMatchReview() {
  return createMatchReview({ db: getDb() });
}

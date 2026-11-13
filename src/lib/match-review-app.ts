import { getDb } from "@/db/client";
import { createMatchReview, keepBoundaryNote } from "@/lib/match-review";

/** The app's Match review module (server only), wired to the app db and BoundaryNoteWriter. */
export function getMatchReview() {
  // Ticket 03 swaps in the production (AI) BoundaryNoteWriter here.
  return createMatchReview({ db: getDb(), boundaryNoteWriter: keepBoundaryNote });
}

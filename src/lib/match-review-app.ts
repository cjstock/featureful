import { getDb } from "@/db/client";
import { appCaller } from "@/lib/ai";
import { createLlmBoundaryNoteWriter } from "@/lib/boundary-note-writer";
import { createMatchReview } from "@/lib/match-review";

/**
 * The app's Match review module (server only), wired to the app db and the AI BoundaryNoteWriter,
 * whose AI calls are recorded for `personId` (the PM giving the review).
 */
export function getMatchReview(personId: number) {
  const db = getDb();
  return createMatchReview({ db, boundaryNoteWriter: createLlmBoundaryNoteWriter(db, appCaller(personId)) });
}

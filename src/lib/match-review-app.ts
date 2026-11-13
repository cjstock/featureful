import { getDb } from "@/db/client";
import { llmBoundaryNoteWriter } from "@/lib/boundary-note-writer";
import { createMatchReview } from "@/lib/match-review";

/** The app's Match review module (server only), wired to the app db and the AI BoundaryNoteWriter. */
export function getMatchReview() {
  return createMatchReview({ db: getDb(), boundaryNoteWriter: llmBoundaryNoteWriter });
}

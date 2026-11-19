import { describe, expect, it } from "vitest";
import type { BoundaryNoteInput } from "@/lib/match-review";
import { ABLATION_REVIEWS } from "../matcher/ablation/cases";
import { distilAblationNotes } from "./ablation-run";

describe("distilAblationNotes", () => {
  it("writes each review into its source and destination Problems in order, carrying each Problem's note forward", async () => {
    const seen: BoundaryNoteInput[] = [];
    const notes = await distilAblationNotes(ABLATION_REVIEWS, async (input) => {
      seen.push(input);
      return `note ${seen.length} on ${input.problem.id}`;
    });

    // The first review moves a Request from Problem 1 to Problem 2; neither has a note yet.
    expect(seen.slice(0, 2).map((i) => [i.problem.id, i.currentNote])).toEqual([
      [1, null],
      [2, null],
    ]);
    // The second review moves from 3 to 4. The sixth moves from a deleted Problem into 3, which by then has a note.
    const intoThree = seen.find((i) => i.problem.id === 3 && i.review.fromProblem === null)!;
    expect(intoThree.currentNote).toBe("note 3 on 3");
    // Every review writes its source (if it still exists) and destination: 2 + 2 + 2 + 2 + 1 + 1 + 2 + 2.
    expect(seen).toHaveLength(14);
    // Problem 3 was last written by the Google Sheets split (the 13th call); Problem 12 never.
    expect(notes[3]).toBe("note 13 on 3");
    expect(notes[12]).toBeUndefined();
  });

  it("keeps a Problem's note as it was when the writer returns nothing", async () => {
    const notes = await distilAblationNotes(ABLATION_REVIEWS.slice(0, 1), async (input) =>
      input.problem.id === 1 ? "  " : "Includes targets.",
    );
    expect(notes).toEqual({ 2: "Includes targets." });
  });
});

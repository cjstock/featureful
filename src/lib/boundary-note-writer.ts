import { z } from "zod";
import type { Db } from "@/db";
import { aiGenerate, type AiCaller } from "@/lib/ai";
import { AI_MAX_OUTPUT_TOKENS } from "@/lib/config";
import type { BoundaryNoteInput, BoundaryNoteWriter } from "@/lib/match-review";

const SYSTEM = `You maintain Boundary notes for Problems in a coffee-tracking app used by home roasters.

A Problem is an underlying customer need behind one or more Requests. Its Boundary note tells an AI Matcher what the Problem does and does not cover, so new Requests are grouped the way the product manager (PM) wants.

You get one Problem, its current Boundary note (if any), and one Match review: a PM's verdict on where a Request belongs.
- "Confirmed": the Request rightly belongs on the Problem it is on.
- "Moved": the Request was wrongly on the source Problem and belongs on the destination Problem.
- "Split": the Request was wrongly on the source Problem and got a new Problem of its own (the destination).

Revise the Problem's Boundary note so it captures the lesson of this review for THIS Problem:
- Keep what the current note says unless the review contradicts it; merge, don't just append.
- Describe needs, not features or specific Requests. Name other Problems by title when it helps draw the line.
- Write at most 3 short sentences, phrased as "Includes … Does not include …".
- Follow the PM's note when there is one.`;

const schema = z.object({
  boundaryNote: z
    .string()
    .min(1)
    .max(600)
    .describe('At most 3 sentences: "Includes … Does not include …"'),
});

const quote = (p: { title: string } | null) => (p ? `"${p.title}"` : "a since-deleted Problem");

function verdictLine({ problem, review }: BoundaryNoteInput): string {
  if (review.verdict === "confirm") return `Confirmed: the Request belongs on "${problem.title}".`;
  const role =
    review.toProblem?.id === problem.id
      ? "This Problem is the destination."
      : "This Problem is the source the Request left.";
  return review.verdict === "move"
    ? `Moved from ${quote(review.fromProblem)} to ${quote(review.toProblem)}. ${role}`
    : `Split from ${quote(review.fromProblem)} into its own new Problem ${quote(review.toProblem)}. ${role}`;
}

/**
 * Production BoundaryNoteWriter: one structured-output AI call about the Problem, recorded in `db`.
 * Throws on failure.
 */
export function createLlmBoundaryNoteWriter(db: Db, caller: AiCaller): BoundaryNoteWriter {
  return async (input) => {
    const { problem, currentNote, review } = input;
    const { output } = await aiGenerate({
      ...caller,
      db,
      module: "boundary_note",
      related: { type: "problem", id: problem.id },
      system: SYSTEM,
      prompt: [
        `Problem: ${problem.title} — ${problem.need}`,
        `Current Boundary note: ${currentNote ?? "(none yet)"}`,
        "",
        "Match review:",
        `Request: ${review.request.title} — ${review.request.description}`,
        `PM verdict: ${verdictLine(input)}`,
        `PM note: ${review.note ?? "(none)"}`,
      ].join("\n"),
      schema,
      maxOutputTokens: AI_MAX_OUTPUT_TOKENS.boundary_note,
    });
    return output.boundaryNote;
  };
}

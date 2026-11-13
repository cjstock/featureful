import { generateText, Output } from "ai";
import { z } from "zod";
import { model } from "@/lib/ai";
import { SUBMITTER_CHOICE_LABELS } from "@/lib/match-review";
import type { Matcher, MatchingExample } from "./index";

const SYSTEM = `You triage feature Requests for a coffee-tracking app used by home roasters (beans, roasts, brews, recipes).

A Request is raw feedback in the submitter's own words; it usually proposes a solution.
A Problem is the underlying customer need behind one or more Requests, stated independently of any solution.

Your job, for one new Request:
1. Work out the underlying need: what the submitter is trying to achieve and why, not the feature they asked for.
2. Compare that need with every existing Problem. Match ONLY when the underlying need is the same, so that one solution would satisfy both. Being about the same area of the app (e.g. both about grinders, or both about recipes) is NOT enough. When unsure, do not match.
3. Always write a new Problem statement for this Request, even when you match, in case the submitter says theirs is different:
   - title: a short noun phrase naming the need (max ~8 words), not a feature name.
   - need: one or two sentences in the first person ("I need to ..."), describing the need and why it matters, without prescribing a solution.

If you match, give your confidence (0 to 1) and a one-line reason a submitter can judge, naming the shared need.

You may also get Matching examples: past Requests where a product manager (PM) reviewed what was decided. "Moved" and "Split" are corrections of a wrong grouping; "Confirmed" means the grouping was right. They show where the PM draws the line between Problems, so follow the same judgement (and the PM's notes) for similar Requests.`;

const schema = z.object({
  matchedProblemId: z
    .number()
    .int()
    .nullable()
    .describe("Id of the existing Problem with the same underlying need, or null"),
  confidence: z.number().min(0).max(1).describe("Confidence in the match; 0 when no match"),
  reason: z.string().describe("One line: why it matches (or why nothing matches)"),
  newProblem: z.object({
    title: z.string(),
    need: z.string(),
  }),
});

const MAX_DESCRIPTION = 300;

const quote = (title: string | null | undefined) => (title ? `"${title}"` : "a since-deleted Problem");

/** One Matching example as prompt text. */
function formatExample(example: MatchingExample, index: number): string {
  const { request, proposal, review } = example;
  const description =
    request.description.length > MAX_DESCRIPTION
      ? `${request.description.slice(0, MAX_DESCRIPTION)}…`
      : request.description;
  const proposed = proposal.match
    ? `match with ${quote(proposal.match.problemTitle)} (confidence ${proposal.match.confidence.toFixed(2)}): ${proposal.match.reason}`
    : `a new Problem "${proposal.newProblem.title}"`;
  const verdict =
    review.verdict === "confirm"
      ? `Confirmed: the Request belongs on ${quote(example.currentProblem.title)}`
      : review.verdict === "move"
        ? `Moved from ${quote(review.fromProblem?.title)} to ${quote(review.toProblem?.title)}`
        : `Split from ${quote(review.fromProblem?.title)} into its own new Problem ${quote(review.toProblem?.title)}`;
  return [
    `Example ${index + 1}:`,
    `Request: ${request.title} — ${description}`,
    `Matcher proposed: ${proposed}`,
    `Submitter: ${SUBMITTER_CHOICE_LABELS[example.submitterChoice]}`,
    `PM verdict: ${verdict}`,
    ...(review.note ? [`PM note: ${review.note}`] : []),
  ].join("\n");
}

/** Production Matcher: one structured-output LLM call over the full Problem list (ADR 0001). */
export const llmMatcher: Matcher = async (request, problems, examples) => {
  const list =
    problems.length === 0
      ? "(none yet)"
      : problems.map((p) => `- id ${p.id}: ${p.title} — ${p.need}`).join("\n");

  const examplesSection =
    examples.length === 0
      ? ""
      : `Matching examples (corrections first, then most recent):\n\n${examples.map(formatExample).join("\n\n")}\n\n`;

  const { output } = await generateText({
    model,
    system: SYSTEM,
    prompt: `${examplesSection}Existing Problems:\n${list}\n\nNew Request:\nTitle: ${request.title}\nDescription: ${request.description}`,
    output: Output.object({ schema }),
  });

  return {
    match:
      output.matchedProblemId === null
        ? null
        : {
            problemId: output.matchedProblemId,
            confidence: output.confidence,
            reason: output.reason,
          },
    newProblem: output.newProblem,
  };
};

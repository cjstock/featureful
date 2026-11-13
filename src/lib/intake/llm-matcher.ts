import { generateText, Output } from "ai";
import { z } from "zod";
import { model } from "@/lib/ai";
import type { Matcher } from "./index";

const SYSTEM = `You triage feature Requests for a coffee-tracking app used by home roasters (beans, roasts, brews, recipes).

A Request is raw feedback in the submitter's own words; it usually proposes a solution.
A Problem is the underlying customer need behind one or more Requests, stated independently of any solution.

Your job, for one new Request:
1. Work out the underlying need: what the submitter is trying to achieve and why, not the feature they asked for.
2. Compare that need with every existing Problem. Match ONLY when the underlying need is the same, so that one solution would satisfy both. Being about the same area of the app (e.g. both about grinders, or both about recipes) is NOT enough. When unsure, do not match.
3. Always write a new Problem statement for this Request, even when you match, in case the submitter says theirs is different:
   - title: a short noun phrase naming the need (max ~8 words), not a feature name.
   - need: one or two sentences in the first person ("I need to ..."), describing the need and why it matters, without prescribing a solution.

If you match, give your confidence (0 to 1) and a one-line reason a submitter can judge, naming the shared need.`;

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

/** Production Matcher: one structured-output LLM call over the full Problem list (ADR 0001). */
export const llmMatcher: Matcher = async (request, problems) => {
  const list =
    problems.length === 0
      ? "(none yet)"
      : problems.map((p) => `- id ${p.id}: ${p.title} — ${p.need}`).join("\n");

  const { output } = await generateText({
    model,
    system: SYSTEM,
    prompt: `Existing Problems:\n${list}\n\nNew Request:\nTitle: ${request.title}\nDescription: ${request.description}`,
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

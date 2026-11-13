import { eq } from "drizzle-orm";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { Db } from "@/db";
import { problems } from "@/db/schema";
import { model } from "@/lib/ai";
import { formatEvidence, type PromptEvidence } from "@/lib/evidence-prompt";
import { getProblem, listEvidence } from "@/lib/problems";
import { getProductStrategy } from "@/lib/product-strategy";
import { CRITERION_LABELS, type CriterionKey, type PriorityScore } from "@/lib/scoring";

/**
 * Brief writer (AI): turns a Problem, its Evidence and its score breakdown into a Decision brief
 * for product leaders. One structured-output LLM call; the sections are rendered to markdown,
 * stored on the Problem and only regenerated when a PM asks.
 */

const SYSTEM = `You write Decision briefs for the product team of a coffee-tracking app (beans, roasts, brews, recipes).

A Problem is an underlying customer need; its Evidence is the raw Requests people wrote about it. Each Problem has a Priority score (0–100) built from Demand (supporter count), Impact, Strategic fit, Effort and delivery Risk (each 1–5; lower Effort and Risk raise the score).

Fill in each section of the brief:
- problemStatement: 2–3 sentences: who has the need, what they are trying to do, and why it matters.
- evidence.summary: a short summary of what the Evidence says (patterns, workarounds, pain). If there is no Evidence, say so.
- evidence.quotes: 2–3 representative quotes, each copied verbatim from the Evidence, with the author's name as given in [brackets]. Never invent quotes; give fewer only if the Evidence has too little to quote.
- scoreBreakdown.summary: 1–2 sentences interpreting the score breakdown given (what drives the Priority score, any PM override). Say plainly if the Problem has not been evaluated.
- recommendation: decide "do", "defer" or "decline", with 2–4 sentences of reasoning grounded in the Evidence, the scores and the Product Strategy.
- openQuestions: 2–4 questions the team should answer before or while acting.

Plain, direct prose. No markdown headings, no preamble, no closing remarks.`;

const RECOMMENDATION_LABELS = { do: "Do", defer: "Defer", decline: "Decline" } as const;

const briefSchema = z.object({
  problemStatement: z.string().min(1),
  evidence: z.object({
    summary: z.string().min(1),
    quotes: z
      .array(z.object({ text: z.string().min(1), author: z.string() }))
      .max(3)
      .describe("2–3 verbatim quotes from the Evidence"),
  }),
  scoreBreakdown: z.object({ summary: z.string().min(1) }),
  recommendation: z.object({
    decision: z.enum(["do", "defer", "decline"]),
    reasoning: z.string().min(1),
  }),
  openQuestions: z.array(z.string().min(1)).min(1).max(4).describe("2–4 questions"),
});

export type BriefSections = z.infer<typeof briefSchema>;

export interface BriefWriterInput {
  problem: {
    title: string;
    need: string;
    impactReason: string | null;
    strategicFitReason: string | null;
    effortReason: string | null;
    riskReason: string | null;
    overrideNote: string | null;
  };
  evidence: (PromptEvidence & { authorName: string })[];
  priority: PriorityScore;
  supporterCount: number;
  productStrategy: string;
}

function reasonFor(criterion: CriterionKey, input: BriefWriterInput) {
  const { problem, supporterCount } = input;
  switch (criterion) {
    case "demand":
      return `${supporterCount} supporter${supporterCount === 1 ? "" : "s"}`;
    case "impact":
      return problem.impactReason;
    case "strategicFit":
      return problem.strategicFitReason;
    case "effort":
      return problem.effortReason;
    case "risk":
      return problem.riskReason;
  }
}

function totalLine({ problem, priority }: BriefWriterInput) {
  return priority.overridden
    ? `Priority score: ${priority.total} (PM override; computed ${priority.computedTotal}${problem.overrideNote ? `; override note: ${problem.overrideNote}` : ""})`
    : `Priority score: ${priority.total}`;
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
/** The Markdown renderer has no pipe escaping, so pipes in table cells become slashes. */
const cell = (text: string) => oneLine(text).replace(/\|/g, "/");

/** Render the structured brief to the stored markdown format (five "##" sections). */
export function renderBrief(sections: BriefSections, input: BriefWriterInput): string {
  const { priority } = input;
  const quotes = sections.evidence.quotes.map(
    (q) => `> ${oneLine(q.text)}\n> — ${oneLine(q.author) || "Anonymous"}`,
  );
  const rows = priority.breakdown.map(
    (c) =>
      `| ${CRITERION_LABELS[c.criterion]} | ${c.score === null ? "–" : `${c.score}/5`} | ${c.score === null ? "Not evaluated" : cell(reasonFor(c.criterion, input) ?? "")} |`,
  );
  const { decision, reasoning } = sections.recommendation;
  return [
    "## Problem statement",
    sections.problemStatement.trim(),
    "## Evidence",
    [sections.evidence.summary.trim(), ...quotes].join("\n\n"),
    "## Score breakdown",
    ["| Criterion | Score | Reason |", "| --- | --- | --- |", ...rows].join("\n"),
    [`**${totalLine(input)}**`, sections.scoreBreakdown.summary.trim()].join("\n\n"),
    "## Recommendation",
    `**${RECOMMENDATION_LABELS[decision]}.** ${reasoning.trim()}`,
    "## Open questions",
    sections.openQuestions.map((q) => `- ${oneLine(q)}`).join("\n"),
  ].join("\n\n");
}

/** One structured-output LLM call returning the brief markdown. Writes nothing. */
export async function runBriefWriter(input: BriefWriterInput): Promise<string> {
  const { problem, evidence, priority, productStrategy } = input;
  const scoreLines = priority.breakdown
    .map(
      (c) =>
        `- ${CRITERION_LABELS[c.criterion]}: ${c.score ?? "not evaluated"}/5 (weight ${c.weight}, ${Math.round(c.points * 10) / 10} points). ${reasonFor(c.criterion, input) ?? ""}`,
    )
    .join("\n");

  const { output } = await generateText({
    model,
    system: SYSTEM,
    prompt: `Product Strategy:\n${productStrategy}\n\nProblem: ${problem.title}\nNeed: ${problem.need}\n\nScore breakdown${priority.evaluated ? "" : " (NOT fully evaluated yet)"}:\n${scoreLines}\n${totalLine(input)}\n\n${formatEvidence(evidence)}`,
    output: Output.object({ schema: briefSchema }),
  });
  return renderBrief(output, input);
}

export interface StoredBrief {
  markdown: string;
  generatedAt: Date;
}

/** The stored Decision brief, or null if none has been generated. Never calls the AI. */
export function getBrief(db: Db, problemId: number): StoredBrief | null {
  const row = db
    .select({ markdown: problems.briefMarkdown, generatedAt: problems.briefGeneratedAt })
    .from(problems)
    .where(eq(problems.id, problemId))
    .get();
  if (!row?.markdown || !row.generatedAt) return null;
  return { markdown: row.markdown, generatedAt: row.generatedAt };
}

/**
 * Generate (or regenerate) a Problem's Decision brief and store it with its generated-at time.
 * Throws if the Problem doesn't exist or the AI call fails; any previous brief is kept then.
 */
export async function generateBrief(db: Db, problemId: number): Promise<StoredBrief> {
  const detail = getProblem(db, problemId);
  if (!detail) throw new Error(`Problem ${problemId} not found`);
  const evidence = listEvidence(db, problemId).map(({ request, author }) => ({
    title: request.title,
    description: request.description,
    authorName: author.name,
  }));

  const markdown = await runBriefWriter({
    problem: detail.problem,
    evidence,
    priority: detail.priority,
    supporterCount: detail.supporters.length,
    productStrategy: getProductStrategy(db).body,
  });

  const generatedAt = new Date();
  db.update(problems)
    .set({ briefMarkdown: markdown, briefGeneratedAt: generatedAt })
    .where(eq(problems.id, problemId))
    .run();
  return { markdown, generatedAt };
}

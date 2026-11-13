import { eq } from "drizzle-orm";
import { generateText } from "ai";
import type { Db } from "@/db";
import { problems } from "@/db/schema";
import { model } from "@/lib/ai";
import { getProblem, listEvidence } from "@/lib/problems";
import { getProductStrategy } from "@/lib/product-strategy";
import type { CriterionKey, PriorityScore } from "@/lib/scoring";

/**
 * Brief writer (AI): turns a Problem, its Evidence and its score breakdown into a Decision brief
 * (markdown) for product leaders. One LLM call; the result is stored on the Problem and only
 * regenerated when a PM asks.
 */

const SYSTEM = `You write Decision briefs for the product team of a coffee-tracking app (beans, roasts, brews, recipes).

A Problem is an underlying customer need; its Evidence is the raw Requests people wrote about it. Each Problem has a Priority score (0–100) built from Demand (supporter count), Impact, Strategic fit, Effort and delivery Risk (each 1–5; lower Effort and Risk raise the score).

Write a concise brief in GitHub-flavoured markdown with exactly these sections, as "##" headings, in this order:
## Problem statement
2–3 sentences: who has the need, what they are trying to do, and why it matters.
## Evidence
A short summary of what the Evidence says (patterns, workarounds, pain), then 2–3 representative quotes as markdown blockquotes, each copied verbatim from the Evidence and attributed like "— <author name>". Never invent quotes. If there is no Evidence, say so.
## Score breakdown
A markdown table with columns Criterion | Score | Reason, one row per criterion, using the scores and reasons given; then one line with the Priority score (mention a PM override if there is one). Say plainly if the Problem has not been evaluated.
## Recommendation
Start with exactly one of **Do**, **Defer** or **Decline** in bold, then 2–4 sentences of reasoning grounded in the Evidence, the scores and the Product Strategy.
## Open questions
2–4 bullet points the team should answer before or while acting.

Plain, direct prose. No preamble, no title line, no closing remarks.`;

const LABELS: Record<CriterionKey, string> = {
  demand: "Demand",
  impact: "Impact",
  strategicFit: "Strategic fit",
  effort: "Effort",
  risk: "Risk",
};

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
  evidence: { title: string; description: string; authorName: string }[];
  priority: PriorityScore;
  supporterCount: number;
  productStrategy: string;
}

/** Most Evidence shown to the model; keeps the prompt bounded on popular Problems. */
const MAX_EVIDENCE = 40;

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

/** One LLM call returning the brief markdown. Writes nothing. */
export async function runBriefWriter(input: BriefWriterInput): Promise<string> {
  const { problem, evidence, priority, productStrategy } = input;
  const shown = evidence.slice(0, MAX_EVIDENCE);
  const evidenceText =
    shown.length === 0
      ? "(no Evidence yet)"
      : shown
          .map((r, i) => `${i + 1}. [${r.authorName}] ${r.title}\n   ${r.description.replace(/\s+/g, " ")}`)
          .join("\n");

  const scoreLines = priority.breakdown
    .map(
      (c) =>
        `- ${LABELS[c.criterion]}: ${c.score ?? "not evaluated"}/5 (weight ${c.weight}, ${Math.round(c.points * 10) / 10} points). ${reasonFor(c.criterion, input) ?? ""}`,
    )
    .join("\n");
  const totalLine = priority.overridden
    ? `Priority score: ${priority.total} (PM override; computed ${priority.computedTotal}${problem.overrideNote ? `; override note: ${problem.overrideNote}` : ""})`
    : `Priority score: ${priority.total}`;

  const { text } = await generateText({
    model,
    system: SYSTEM,
    prompt: `Product Strategy:\n${productStrategy}\n\nProblem: ${problem.title}\nNeed: ${problem.need}\n\nScore breakdown${priority.evaluated ? "" : " (NOT fully evaluated yet)"}:\n${scoreLines}\n${totalLine}\n\nEvidence (${evidence.length} Requests${evidence.length > shown.length ? `, first ${shown.length} shown` : ""}):\n${evidenceText}`,
  });
  const markdown = text.trim();
  if (!markdown) throw new Error("The Brief writer returned an empty brief");
  return markdown;
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

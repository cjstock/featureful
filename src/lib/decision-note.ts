import { eq } from "drizzle-orm";
import { generateText } from "ai";
import { z } from "zod";
import type { Db } from "@/db";
import { problems, STATUSES, type Status } from "@/db/schema";
import { model } from "@/lib/ai";
import { getBrief } from "@/lib/brief-writer";
import { getProblem, listEvidence, STATUS_LABELS } from "@/lib/problems";

/**
 * Status changes and Decision notes. A PM changes a Problem's Status and attaches a Decision note
 * (Customer-facing) in one write. The Decision note drafter (AI) suggests a note; nothing is saved
 * until the PM confirms.
 */

export const statusChangeSchema = z.object({
  status: z.enum(STATUSES, { error: "Choose a Status" }),
  note: z
    .string()
    .trim()
    .min(1, "Write a Decision note explaining the Status")
    .max(2000, "Keep the Decision note under 2000 characters"),
});

export type StatusChange = z.infer<typeof statusChangeSchema>;

/** Saves Status and Decision note together. Returns false if no such Problem. */
export function changeStatus(db: Db, problemId: number, input: StatusChange): boolean {
  const { status, note } = statusChangeSchema.parse(input);
  const result = db
    .update(problems)
    .set({ status, decisionNote: note })
    .where(eq(problems.id, problemId))
    .run();
  return result.changes > 0;
}

const SYSTEM = `You write Decision notes for the product team of a coffee-tracking app (beans, roasts, brews, recipes).

A Decision note tells the Customers who support a Problem (an underlying customer need) where it stands and why. It is shown publicly next to the Problem's Status (Open, Planned, In progress, Shipped or Declined).

Write 2–4 short sentences, in plain friendly prose, addressed to Customers ("you"/"we"):
- Say what the new Status means for them in concrete terms.
- Give the honest reason, grounded in the Decision brief (if given) and the Evidence. For Declined, be respectful and, where sensible, mention a workaround or what could change the decision.
- Never promise dates, never reveal internal scores, weights, Priority numbers, other customers' names or internal deliberation, and never quote Evidence verbatim.

Output only the note text: no greeting, no sign-off, no markdown headings.`;

export interface NoteDrafterInput {
  problem: { title: string; need: string; status: Status; decisionNote: string | null };
  targetStatus: Status;
  /** The stored Decision brief markdown, if one has been generated. */
  brief: string | null;
  evidence: { title: string; description: string }[];
}

/** Most Evidence shown to the model; keeps the prompt bounded on popular Problems. */
const MAX_EVIDENCE = 30;

/** One LLM call returning a draft Decision note. Writes nothing. Works without a brief. */
export async function runNoteDrafter(input: NoteDrafterInput): Promise<string> {
  const { problem, targetStatus, brief, evidence } = input;
  const shown = evidence.slice(0, MAX_EVIDENCE);
  const evidenceText =
    shown.length === 0
      ? "(no Evidence yet)"
      : shown.map((r, i) => `${i + 1}. ${r.title}: ${r.description.replace(/\s+/g, " ")}`).join("\n");

  const { text } = await generateText({
    model,
    system: SYSTEM,
    prompt: [
      `Problem: ${problem.title}`,
      `Need: ${problem.need}`,
      `Current Status: ${STATUS_LABELS[problem.status]}`,
      `New Status: ${STATUS_LABELS[targetStatus]}`,
      problem.decisionNote ? `Previous Decision note: ${problem.decisionNote}` : null,
      "",
      `Decision brief:\n${brief ?? "(no brief generated; rely on the Problem and its Evidence)"}`,
      "",
      `Evidence (${evidence.length} Requests${evidence.length > shown.length ? `, first ${shown.length} shown` : ""}):\n${evidenceText}`,
    ]
      .filter((line) => line !== null)
      .join("\n"),
  });
  const note = text.trim();
  if (!note) throw new Error("The Decision note drafter returned an empty note");
  return note;
}

/** Drafts a Decision note for moving a Problem to `targetStatus`. One AI call; writes nothing. */
export async function draftDecisionNote(db: Db, problemId: number, targetStatus: Status): Promise<string> {
  const detail = getProblem(db, problemId);
  if (!detail) throw new Error(`Problem ${problemId} not found`);
  const evidence = listEvidence(db, problemId).map(({ request }) => ({
    title: request.title,
    description: request.description,
  }));
  return runNoteDrafter({
    problem: detail.problem,
    targetStatus,
    brief: getBrief(db, problemId)?.markdown ?? null,
    evidence,
  });
}

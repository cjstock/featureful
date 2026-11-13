/** Shared formatting of a Problem's Evidence for AI prompts. */

/** Most Evidence shown to the model; keeps prompts bounded on popular Problems. */
export const MAX_EVIDENCE = 40;

export interface PromptEvidence {
  title: string;
  description: string;
  /** Included as "[name]" when given (internal-only prompts). */
  authorName?: string;
}

/** "Evidence (N Requests[, first M shown]):" followed by a numbered list, or "(no Evidence yet)". */
export function formatEvidence(evidence: PromptEvidence[]): string {
  const shown = evidence.slice(0, MAX_EVIDENCE);
  const list =
    shown.length === 0
      ? "(no Evidence yet)"
      : shown
          .map(
            (r, i) =>
              `${i + 1}. ${r.authorName ? `[${r.authorName}] ` : ""}${r.title}\n   ${r.description.replace(/\s+/g, " ")}`,
          )
          .join("\n");
  const truncated = evidence.length > shown.length ? `, first ${shown.length} shown` : "";
  return `Evidence (${evidence.length} Requests${truncated}):\n${list}`;
}

/** Shared formatting of a Problem's Evidence for AI prompts. */
import { tagCustomerText } from "@/lib/customer-text";

/** Most Evidence shown to the model; keeps prompts bounded on popular Problems. */
export const MAX_EVIDENCE = 40;

export interface PromptEvidence {
  title: string;
  description: string;
  /** Included as "[name]" when given (internal-only prompts). */
  authorName?: string;
}

/**
 * "Evidence (N Requests[, first M shown]):" followed by a numbered list, or "(no Evidence yet)".
 * With `delimit`, each Request's text is wrapped in `<evidence>` (see `customer-text.ts`); the
 * prompt's system prompt must then carry `customerTextRule("evidence")`.
 */
export function formatEvidence(evidence: PromptEvidence[], { delimit = false } = {}): string {
  const shown = evidence.slice(0, MAX_EVIDENCE);
  const list =
    shown.length === 0
      ? "(no Evidence yet)"
      : shown
          .map((r, i) => {
            const text = `${r.title}\n   ${r.description.replace(/\s+/g, " ")}`;
            return `${i + 1}. ${r.authorName ? `[${r.authorName}] ` : ""}${delimit ? tagCustomerText("evidence", text) : text}`;
          })
          .join("\n");
  const truncated = evidence.length > shown.length ? `, first ${shown.length} shown` : "";
  return `Evidence (${evidence.length} Requests${truncated}):\n${list}`;
}

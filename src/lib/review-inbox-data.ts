import { count, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { problems, supports, type EscalationReason } from "@/db/schema";
import { ESCALATION_REASON_LABELS } from "@/lib/escalation-labels";
import type { MatchingDecisionItem, MatchReview } from "@/lib/match-review";
import { listEvidence } from "@/lib/problems";
import { inboxCard, reasonDetail, type ComparedRef, type InboxCard } from "@/lib/review-inbox";

/** Reads for the Escalation inbox's detail pane (server only). */

/** The detail pane shows at most this many Evidence excerpts for the compared Problem. */
export const MAX_EVIDENCE_EXCERPTS = 3;
const EXCERPT_LENGTH = 160;

export type InboxEvidence = { requestId: number; title: string; excerpt: string; authorName: string };

/** The Problem the Request is compared with, with enough to judge the need without leaving the page. */
export type ComparedProblem = {
  id: number;
  title: string;
  need: string;
  role: ComparedRef["role"];
  supporters: number;
  evidence: InboxEvidence[];
};

/** A Matching decision as the inbox shows it. */
export type InboxItem = Pick<
  MatchingDecisionItem,
  "id" | "createdAt" | "request" | "escalationReasons" | "matcherOutcome" | "currentProblem" | "aiCall"
> & {
  submitterName: string;
  reasons: { reason: EscalationReason; label: string; detail: string }[];
  card: InboxCard;
  compared: ComparedProblem | null;
  /** The Matcher's proposed match, when it proposed one. */
  match: { confidence: number; reason: string } | null;
  /** With no match: the Matcher's confidence in the runner-up. */
  closestConfidence: number | null;
  newProblem: { title: string; need: string };
};

/** "First 160 characters…", whitespace collapsed. */
export function excerpt(text: string, length = EXCERPT_LENGTH): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length).trimEnd()}…` : flat;
}

/**
 * Every unreviewed Matching decision (the Escalation queue and the Auto-accepted ones), with its
 * card and the compared Problem's need, supporter count and first Evidence (not the Request
 * itself). Grouping and order are the inbox's (`groupInbox`).
 */
export function loadInbox(db: Db, review: MatchReview): InboxItem[] {
  const decisions = [...review.listQueue(), ...review.listNotEscalated()];
  const cards = new Map(decisions.map((d) => [d.id, inboxCard(d)]));

  const comparedIds = [...new Set(decisions.flatMap((d) => cards.get(d.id)!.compared?.problemId ?? []))];
  const problemIds = [...new Set([...decisions.map((d) => d.currentProblem.id), ...comparedIds])];
  const supporters = new Map(
    problemIds.length === 0
      ? []
      : db
          .select({ problemId: supports.problemId, n: count() })
          .from(supports)
          .where(inArray(supports.problemId, problemIds))
          .groupBy(supports.problemId)
          .all()
          .map((r) => [r.problemId, r.n]),
  );
  const needs = new Map(
    comparedIds.length === 0
      ? []
      : db
          .select({ id: problems.id, title: problems.title, need: problems.need })
          .from(problems)
          .where(inArray(problems.id, comparedIds))
          .all()
          .map((p) => [p.id, p]),
  );
  const evidence = new Map(comparedIds.map((id) => [id, listEvidence(db, id)]));

  return decisions.map((d) => {
    const card = cards.get(d.id)!;
    const ref = card.compared;
    const problem = ref ? needs.get(ref.problemId) : undefined;
    const context = {
      matcherOutcome: d.matcherOutcome,
      matchConfidence: d.proposal.match?.confidence ?? null,
      closestConfidence: d.proposal.closestProblem?.confidence ?? null,
      supporters: supporters.get(d.currentProblem.id) ?? 0,
    };
    return {
      id: d.id,
      createdAt: d.createdAt,
      request: d.request,
      escalationReasons: d.escalationReasons,
      matcherOutcome: d.matcherOutcome,
      currentProblem: d.currentProblem,
      aiCall: d.aiCall,
      submitterName: d.submitter.name,
      reasons: d.escalationReasons.map((reason) => ({
        reason,
        label: ESCALATION_REASON_LABELS[reason],
        detail: reasonDetail(reason, context),
      })),
      card,
      compared:
        ref && problem
          ? {
              ...problem,
              role: ref.role,
              supporters: supporters.get(problem.id) ?? 0,
              evidence: (evidence.get(problem.id) ?? [])
                .filter((e) => e.request.id !== d.request.id)
                .slice(0, MAX_EVIDENCE_EXCERPTS)
                .map((e) => ({
                  requestId: e.request.id,
                  title: e.request.title,
                  excerpt: excerpt(e.request.description),
                  authorName: e.author.name,
                })),
            }
          : null,
      match: d.proposal.match && { confidence: d.proposal.match.confidence, reason: d.proposal.match.reason },
      closestConfidence: d.proposal.closestProblem?.confidence ?? null,
      newProblem: d.proposal.newProblem,
    };
  });
}

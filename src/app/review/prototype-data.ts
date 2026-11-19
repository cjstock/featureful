// PROTOTYPE (v2 wayfinder ticket 05): throwaway. Builds escalation-queue items from real seed data.
// Escalation reasons that the v1 data can't produce (bypassed, near miss, "mine is different",
// spot check) are SIMULATED deterministically from the decision id and flagged `simulated`.

import { asc, count } from "drizzle-orm";
import type { Db } from "@/db";
import { problems, supports } from "@/db/schema";
import { listEvidence } from "@/lib/problems";
import type { MatchingDecisionItem } from "@/lib/match-review";

export type ReasonKey = "bypassed" | "different" | "highDemand" | "lowConfidence" | "nearMiss" | "spotCheck";

export const REASON_ORDER: ReasonKey[] = [
  "bypassed",
  "different",
  "highDemand",
  "lowConfidence",
  "nearMiss",
  "spotCheck",
];

export const REASON_LABELS: Record<ReasonKey, string> = {
  bypassed: "Bypassed",
  different: "Mine is different",
  highDemand: "High-Demand merge",
  lowConfidence: "Low confidence",
  nearMiss: "Near miss",
  spotCheck: "Spot check",
};

export type ProtoReason = { key: ReasonKey; detail: string; simulated: boolean };

export type ProtoProblem = {
  id: number;
  title: string;
  need: string;
  supporters: number;
  evidence: { title: string; excerpt: string; author: string }[];
};

export type ProtoItem = {
  id: number;
  createdAt: string;
  request: { title: string; description: string };
  submitter: { name: string; role: string };
  /** What the Matcher proposed. */
  kind: "match" | "new" | "bypassed";
  confidence: number | null;
  reason: string | null;
  newProblem: { title: string; need: string };
  submitterChoice: string;
  /** The Problem the card compares against: the matched Problem, or the near-miss runner-up. */
  compared: ProtoProblem | null;
  currentProblemId: number;
  reasons: ProtoReason[];
  trace: { version: string; cost: string; latency: string };
};

const excerpt = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function buildPrototypeItems(db: Db, queue: MatchingDecisionItem[]) {
  const supporterCounts = new Map(
    db
      .select({ problemId: supports.problemId, n: count() })
      .from(supports)
      .groupBy(supports.problemId)
      .all()
      .map((r) => [r.problemId, r.n]),
  );
  const allProblems = db
    .select({ id: problems.id, title: problems.title, need: problems.need })
    .from(problems)
    .orderBy(asc(problems.title))
    .all();

  const problemView = (id: number, excludeRequestTitle?: string): ProtoProblem | null => {
    const p = allProblems.find((x) => x.id === id);
    if (!p) return null;
    const evidence = listEvidence(db, id)
      .filter((e) => e.request.title !== excludeRequestTitle)
      .slice(0, 3)
      .map((e) => ({ title: e.request.title, excerpt: excerpt(e.request.description), author: e.author.name }));
    return { ...p, supporters: supporterCounts.get(id) ?? 0, evidence };
  };

  const items: ProtoItem[] = queue.map((d) => {
    const reasons: ProtoReason[] = [];
    const match = d.proposal.match;
    let kind: ProtoItem["kind"] = match ? "match" : "new";
    let compared: ProtoProblem | null = null;
    let confidence = match?.confidence ?? null;

    // Simulated: every 7th decision had the Matcher off.
    if (d.id % 7 === 0) {
      kind = "bypassed";
      confidence = null;
      reasons.push({ key: "bypassed", detail: "Matcher was off (simulated)", simulated: true });
    } else if (match && match.problemId !== null) {
      compared = problemView(match.problemId, d.request.title);
      if (d.submitterChoice === "rejected" || d.id % 4 === 1)
        reasons.push({
          key: "different",
          detail: "Submitter said theirs is different",
          simulated: d.submitterChoice !== "rejected",
        });
      if (compared && compared.supporters >= 5)
        reasons.push({ key: "highDemand", detail: `${compared.supporters} supporters`, simulated: false });
      if (match.confidence < 0.75)
        reasons.push({
          key: "lowConfidence",
          detail: `${Math.round(match.confidence * 100)}% confident`,
          simulated: false,
        });
    } else if (d.id % 3 === 0) {
      // Simulated near miss: pick some other Problem as the runner-up.
      const other = allProblems.filter((p) => p.id !== d.currentProblem.id)[d.id % Math.max(1, allProblems.length - 1)];
      if (other) {
        compared = problemView(other.id);
        confidence = 0.4 + (d.id % 5) * 0.05;
        reasons.push({
          key: "nearMiss",
          detail: `Runner-up at ${Math.round(confidence * 100)}% (simulated)`,
          simulated: true,
        });
      }
    }
    if (reasons.length === 0 && d.id % 10 === 0)
      reasons.push({ key: "spotCheck", detail: "Random 10% sample (simulated)", simulated: true });

    return {
      id: d.id,
      createdAt: d.createdAt.toISOString(),
      request: d.request,
      submitter: { name: d.submitter.name, role: d.submitter.role },
      kind,
      confidence,
      reason: kind === "bypassed" ? null : (match?.reason ?? null),
      newProblem: d.proposal.newProblem,
      submitterChoice: d.submitterChoice,
      compared,
      currentProblemId: d.currentProblem.id,
      reasons,
      trace: {
        version: `v${(d.id * 2654435761).toString(16).slice(-4)}`,
        cost: `$${(0.003 + (d.id % 5) * 0.001).toFixed(3)}`,
        latency: `${(0.9 + (d.id % 7) * 0.2).toFixed(1)}s`,
      },
    };
  });

  const rank = (i: ProtoItem) =>
    Math.min(...i.reasons.map((r) => REASON_ORDER.indexOf(r.key)), REASON_ORDER.length);
  const escalated = items
    .filter((i) => i.reasons.length > 0)
    .sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt));
  const notEscalated = items.filter((i) => i.reasons.length === 0);

  return { escalated, notEscalated, problems: allProblems.map(({ id, title }) => ({ id, title })) };
}

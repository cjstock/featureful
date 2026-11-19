import { createHash } from "node:crypto";
import { count, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import {
  ESCALATION_REASONS,
  matchingDecisions,
  requests,
  supports,
  type EscalationReason,
  type MatcherOutcome,
  type SubmitterChoice,
} from "@/db/schema";
import { ESCALATION } from "@/lib/config";

/**
 * Escalation: which Matching decisions reach a PM for Match review, and why. Reasons are computed
 * deterministically at confirm time (and by the post-migration backfill) and stored on the
 * decision. Thresholds live in `ESCALATION` (config).
 */

/** The reasons a Confirm makes the decision a Matching example: the ambiguity reasons. */
export const AMBIGUITY_REASONS = ["mine_is_different", "low_confidence", "near_miss"] as const satisfies
  readonly EscalationReason[];

/** What the reasons are computed from. */
export type EscalationInput = {
  decisionId: number;
  matcherOutcome: MatcherOutcome;
  submitterChoice: SubmitterChoice;
  /** The proposed match's confidence; null when the Matcher proposed a new Problem (or was bypassed). */
  matchConfidence: number | null;
  /** When the Matcher proposed a new Problem: its confidence in the closest existing Problem. */
  closestConfidence: number | null;
  /** Supporters of the Problem the Request joined, counting the submitter (after they joined). */
  supporters: number;
};

/** Whether a decision falls in the seeded spot-check sample: a stable hash of its id and the salt. */
export function isSpotCheck(decisionId: number): boolean {
  const digest = createHash("sha256").update(`${ESCALATION.spotCheckSalt}:${decisionId}`).digest();
  return digest.readUInt32BE(0) / 2 ** 32 < ESCALATION.spotCheckRate;
}

/** A decision's Escalation reasons, strongest first. Empty means Auto-accepted. */
export function escalationReasons(input: EscalationInput): EscalationReason[] {
  const found = new Set<EscalationReason>();
  if (input.matcherOutcome !== "ok") found.add("bypassed");
  if (input.submitterChoice === "rejected") found.add("mine_is_different");
  if (input.submitterChoice === "accepted" && input.supporters >= ESCALATION.highDemandSupporters) {
    found.add("high_demand_merge");
  }
  if (input.matchConfidence !== null && input.matchConfidence < ESCALATION.lowConfidenceBelow) {
    found.add("low_confidence");
  }
  if (
    input.matchConfidence === null &&
    input.closestConfidence !== null &&
    input.closestConfidence >= ESCALATION.nearMissAtLeast
  ) {
    found.add("near_miss");
  }
  if (found.size === 0 && isSpotCheck(input.decisionId)) found.add("spot_check");
  return ESCALATION_REASONS.filter((r) => found.has(r));
}

/** The app database or a transaction on it. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Compute a stored Matching decision's Escalation reasons from its row, its Request's Problem
 * and that Problem's Supports, and store them. Used at confirm time (inside its transaction) and
 * by the backfill, so both compute reasons the same way.
 */
export function storeEscalationReasons(db: DbOrTx, decisionId: number): EscalationReason[] {
  const row = db
    .select({
      matcherOutcome: matchingDecisions.matcherOutcome,
      submitterChoice: matchingDecisions.submitterChoice,
      confidence: matchingDecisions.confidence,
      closestConfidence: matchingDecisions.closestConfidence,
      problemId: requests.problemId,
    })
    .from(matchingDecisions)
    .innerJoin(requests, eq(requests.id, matchingDecisions.requestId))
    .where(eq(matchingDecisions.id, decisionId))
    .get();
  if (!row) throw new Error("Matching decision not found");
  // Confirm runs this after adding the submitter's Support, so the count includes this merge.
  const supporters =
    db.select({ n: count() }).from(supports).where(eq(supports.problemId, row.problemId)).get()?.n ?? 0;
  const reasons = escalationReasons({
    decisionId,
    matcherOutcome: row.matcherOutcome,
    submitterChoice: row.submitterChoice,
    matchConfidence: row.confidence,
    closestConfidence: row.closestConfidence,
    supporters,
  });
  db.update(matchingDecisions)
    .set({ escalationReasons: reasons })
    .where(eq(matchingDecisions.id, decisionId))
    .run();
  return reasons;
}

/**
 * Data migration, run after the SQL migrations on every open: compute reasons for each Matching
 * decision that has none yet (those made before Escalation existed). A no-op once done. Reviewed
 * decisions get reasons too, so the Confirm-as-Matching-example rule treats old Confirms the same
 * way. Reasons use today's Support counts, the only ones there are.
 */
export function backfillEscalationReasons(db: Db): number {
  const pending = (tx: DbOrTx) =>
    tx.select({ id: matchingDecisions.id }).from(matchingDecisions).where(isNull(matchingDecisions.escalationReasons)).all();
  // The usual case on startup: nothing to do, so take no write lock.
  if (pending(db).length === 0) return 0;
  // IMMEDIATE takes the write lock before reading, so two processes opening the database at once
  // queue on the busy timeout instead of one failing with SQLITE_BUSY_SNAPSHOT on upgrade. The
  // second one then finds nothing left to do.
  return db.transaction(
    (tx) => {
      const rows = pending(tx);
      for (const { id } of rows) storeEscalationReasons(tx, id);
      return rows.length;
    },
    { behavior: "immediate" },
  );
}

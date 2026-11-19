# 04: Escalation: reasons, ranking, Auto-accepted, Regression case marks

**What to build:** Matching decisions get deterministic Escalation reasons at confirm time, and only escalated ones form the review queue, ranked. Everything else is Auto-accepted.
- The Matcher reports a `closestProblem` whenever it proposes a new Problem.
- Move and Split require a note and can be marked as Regression cases.
- Confirms feed Matching examples only for ambiguity reasons.
- `npm run eval:pull` exports marked cases.

The existing `/review` page lists the ranked queue with reason chips; the inbox UI comes in the next ticket. Detail: [escalation ticket](../04-match-review-escalation.md).

**Lane:** 🔴 Red (migration + backfill), 🟡 for the prompt change

**Blocked by:** 03

**Status:** done ([#5](https://github.com/cjstock/featureful/pull/5); was parked overnight on a noisy replay-F1 gate, unparked 2026-11-19 after rebase + fix pass 1)

Parked overnight: the CI eval gate failed on PR #5 (replay F1 0.750 vs baseline 0.846, limit −0.05; one extra Problem, recall 0.733 → 0.600, precision 1.000, fixed-state cases identical), while the local live run of the same commit matched the baseline exactly. Two runs cannot separate run-to-run variance in the 26-Request replay from a real recall cost of the new `closestProblem` paragraph, and the runbook forbids re-running until green or weakening the gate. The human should measure variance (a few runs on v2 vs this branch) and decide whether the F1 gate needs a design change (mean of N, temperature 0, or a wider threshold). Blocks 05, 07, 09.

- [ ] Migration: decisions gain `escalation_reasons` (JSON), `matcher_outcome` (`ok|failed|off|budget`), `closest_problem_id` and `closest_confidence`, and `regression_case` (bool). Unreviewed decisions are backfilled with computed reasons.
- [ ] The reasons and their thresholds live in config:
  - Bypassed: `matcher_outcome != ok`
  - Mine is different
  - High-Demand merge: ≥5 supporters
  - Low confidence: below 0.75
  - Near miss: no match, and closest confidence ≥0.4
  - Spot check: a seeded-random 10% of the rest
- [ ] A Matcher failure during propose still lets the submitter save as a new Problem, with `matcher_outcome = failed`.
- [ ] Queue: escalated, unreviewed decisions, ranked by the strongest reason (bypassed > mine is different > high-Demand > low confidence > near miss > spot check), then oldest first. A "Not escalated" list holds the Auto-accepted ones, which stay reviewable.
- [ ] Matcher output gains `closestProblem: { id, confidence } | null` (prompt + schema). The eval must pass the gate against baseline; update the baseline in this PR only if the new field legitimately changes outcomes, and explain it.
- [ ] `review` rejects Move or Split without a note. It stores `regression_case` (default true for Move/Split).
- [ ] `listMatchingExamples` keeps every correction, but includes a Confirm only when its reasons include mine is different, low confidence or near miss.
- [ ] `npm run eval:pull` writes the marked decisions to `evals/matcher/regression.json` (`kind: regression`, `source: Matching decision #id`), built from the AI call's `shown_problems`.
- [ ] Tests cover: reason computation for every reason, ranking, the Confirm-as-example rule, the note requirement, the backfill on existing data, and the export format.

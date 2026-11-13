# 07: Instrumented metrics on /review

Type: grilling
Status: resolved
Blocked by: 02, 04

## Question

Which metrics does `/review` show, with exact definitions and windows? Candidates: PM agreement rate, escalation rate, cost per Request, regression cases added, latest eval score vs baseline. Which of the Loom's success metrics do they replace or prove? What's the baseline for each, and what would count as a bad trend? Include what each number can't tell you.

Also consider (from the trace/budget ticket): today's AI spend vs the daily cap, and counts of refused AI calls (over budget, switched off).

From the queue prototype: the inbox header shows PM agreement, escalated-of-total and Regression cases added. Define each one's window here (the prototype used "this session").

## Answer

Resolved 2026-11-18 (grilling). Key insight: Escalations are hard cases by design, so only **spot checks** give an unbiased measure of accuracy.

1. **PM agreement rate (headline):** Confirms ÷ spot-check Match reviews, over the last 30 reviewed spot checks. Agreement on Escalations is shown as a secondary figure. Bypassed decisions are excluded from both.
2. **Escalation rate:** escalated ÷ all Matching decisions, last 7 days, broken down by Escalation reason. No target: it's read as information.
3. **Regression cases marked:** Move/Split reviews marked as Regression cases, last 30 days. Labelled "marked" because the app can't see the export or commit.
4. **Cost and controls:** today's spend vs the $2 cap (a bar); cost per Request (Matcher + Evaluator AI calls for Requests submitted in the last 7 days ÷ those Requests); refused AI calls today, split into over budget and switched off.
5. **Eval:** the last committed `evals/baseline.json` (F1, case accuracy, commit), labelled as eval, not production. No CI reads.
6. **Workflow outcome (the metric this moves):** median days from a Problem's first Request to its first non-Open Status, and the % of non-Open Problems with a Decision note.
7. **Layout:** the inbox header strip shows spot-check agreement, escalation rate and Regression cases marked. A "Details" disclosure holds Escalation agreement, cost, refusals, the eval baseline, the reason breakdown and the workflow outcome. No separate page.
8. **Honesty rules:** n < 10 shows "n = 4, too few" instead of a percentage. Every stat shows its n and window, plus a one-line "what this can't tell you" tooltip (e.g. "Spot-check agreement can't see wrong matches the submitter accepted and nobody reviewed.").
9. **Glossary:** added PM agreement rate and Escalation rate.

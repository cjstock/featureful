# 09: Inbox metrics header and Details

**What to build:**
- **Header strip** on the Escalation inbox: spot-check PM agreement rate, Escalation rate and Regression cases marked.
- **Details disclosure:** agreement on Escalations, today's spend vs cap, cost per Request, refused AI calls today, the committed eval baseline, the reason breakdown, and the workflow outcome (median days to a decision, % of decided Problems with a Decision note).
- **Honesty rules:** every stat shows its n and window and what it can't tell you. With n < 10, it shows "too few".

Detail: [metrics ticket](../07-review-metrics.md).

**Lane:** 🟡 Yellow (metrics queries)

**Blocked by:** 05, 07

**Status:** ready-for-agent

- [ ] PM agreement rate = Confirms ÷ spot-check Match reviews, over the last 30 spot checks. Escalation agreement is the same measure over Escalations. Bypassed decisions are excluded from both.
- [ ] Escalation rate = escalated ÷ all Matching decisions, last 7 days, with a per-reason breakdown in Details.
- [ ] Regression cases marked: last 30 days, labelled "marked".
- [ ] Spend: today's `source: app` cost against `AI_DAILY_BUDGET_USD`, as a bar. Cost per Request: Matcher + Evaluator AI calls related to Requests from the last 7 days, divided by those Requests. Refusals today, split into over budget and switched off.
- [ ] Eval: F1, case accuracy and commit from `evals/baseline.json`, labelled "last committed eval (not production)".
- [ ] Time to decision: the median days from a Problem's first Request to its first non-Open Status. Plus the % of non-Open Problems with a Decision note.
- [ ] Each stat has a one-line "what this can't tell you" tooltip (e.g. "can't see wrong matches the submitter accepted and nobody reviewed").
- [ ] Tests for every query, including the n < 10 rule and the window boundaries.

# 07: Daily budget, submit rate limit and per-module off switch

**What to build:** Controls that live in infrastructure, not in the prompt.
- **Budget:** `aiGenerate` refuses a call whose worst-case cost would cross today's remaining app budget.
- **Off switch:** a PM can switch each module off in AI controls on `/strategy`, and every flip is recorded.
- **Degrade, don't block:** running out of budget or switching off degrades each module: the Matcher makes a Bypassed new Problem; the Evaluator shows "not evaluated" with the reason; the writers' buttons are disabled.
- **Rate limit:** a person can submit at most 10 Requests an hour.

Detail: [trace ticket](../02-trace-budget-off-switch.md).

**Lane:** 🔴 Red

**Blocked by:** 04

**Status:** ready-for-agent (blocked: 04 is parked, needs-human)

- [ ] `AI_DAILY_BUDGET_USD` (default 2) sums `cost_usd` over today's (UTC) `source: app` AI calls. The worst case before a call is (prompt chars ÷ 4 × input price) + (cap × output price). Over budget means the call is not sent and an AI call row is written with `refused_budget`.
- [ ] Settings table with one on/off row per module, and an audit table (module, on, person, at). PM-only server actions, guarded server-side. A call to a switched-off module writes `refused_off`.
- [ ] Degrade paths:
  - Matcher refused → the Request saves as a new Problem with `matcher_outcome = off|budget`, so it's escalated as Bypassed. The submitter sees "Matching is paused; a PM will group your Request."
  - Evaluator refused → "Not evaluated (budget reached / Evaluator off)".
  - Writer buttons disabled with the reason; the PM writes by hand.
- [ ] `/review` shows a PM banner when the budget is reached: "AI budget reached at HH:MM UTC; resets 00:00 UTC".
- [ ] Rate limit: the 11th submission by a person within a rolling hour is rejected with "try again at HH:MM". The limit lives in config.
- [ ] AI controls section on `/strategy`: a toggle per module, with the last flip's person and time.
- [ ] Failure-path tests: over budget per module, switched off per module, a non-PM toggle attempt rejected, the rate limit boundary (10 OK, 11 rejected), and the budget reset at the UTC day boundary.

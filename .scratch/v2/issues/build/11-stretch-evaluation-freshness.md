# 11: (Stretch) Evaluation freshness and failure state

**What to build:** A Problem with Evidence newer than `evaluatedAt` shows "Stale: new Evidence since the last evaluation". A Problem whose latest Evaluator AI call didn't return `ok` shows "Evaluation failed at HH:MM". Both offer PM-only "Re-evaluate". Cut first if time is short.

**Lane:** 🟢 Green (UI) + 🟡 (query)

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Stale = max(Evidence.createdAt) > `evaluatedAt`. Failed = the latest AI call with module Evaluator and this Problem has outcome ≠ ok.
- [ ] Shown on the Problem page and as a small marker in the Problems list for Internal stakeholders.
- [ ] Tests for both conditions.

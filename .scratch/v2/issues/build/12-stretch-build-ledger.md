# 12: (Stretch) Build ledger

**What to build:** `docs/build-ledger.md` has one row per build ticket. It's built from timestamps and recorded usage, not self-reports. Cut first if time is short; it can be written afterwards. Detail: [delegation charter ticket](../08-delegation-charter.md).

**Lane:** 🟢 Green (docs)

**Blocked by:** None (filled in as tickets land; finalised last)

**Status:** ready-for-agent

- [ ] Columns:
  - ticket, lane
  - start/end (`prompts.txt` timestamps, PR open→merge)
  - agent tokens and cost (subagent usage reports)
  - app AI spend during the ticket (`ai_calls` with `source: eval|seed`)
  - fix passes
  - accepted-without-fixes (Y/N)
- [ ] A totals row, plus one paragraph on where the bottleneck moved.

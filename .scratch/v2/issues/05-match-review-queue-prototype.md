# 05: Match review queue UI prototype

Type: prototype
Status: resolved
Blocked by: 04

## Question

How should the escalation queue from 04 look and behave for a PM working through it? That covers the escalation reason on each card, the Confirm/Move/Split flow, how fast a PM can clear the queue, and where the outcome (agreement rate, a regression case added) becomes visible. It also covers how a Boundary note suggestion would appear, if 06 keeps them.

## Answer

Resolved 2026-11-18 (prototype). Prototype: bookmark `prototype/match-review-queue` (commit 6327123a, pushed; throwaway, never merged). Run it with `jj new prototype/match-review-queue && npm run dev`, then open `/review?variant=A|B|C` as the PM. Variants: A annotated list, B triage inbox, C focus mode.

**Verdict: B's triage inbox with C's outcome stats on top.**

- **Header:** C's three outcome stats: PM agreement, how many decisions were escalated out of the total, and Regression cases added.
- **Left pane:** the queue grouped by each decision's strongest Escalation reason, groups in the escalation-ticket order (bypassed > mine is different > high-Demand merge > low confidence > near miss > spot check), oldest first within a group, with counts. "Not escalated" (Auto-accepted) is the last group, so any Auto-accepted decision stays reviewable from the same place.
- **Right pane:** the detail. Reason chips, then the card's question ("Does this Request share the need of this Problem?"; "Group this Request" when bypassed). The new Request sits side by side with the compared Problem: its need, supporter count and up to 3 Evidence excerpts. The compared Problem is the match, or the runner-up on a near miss. Under that: the Matcher's reason and confidence, and the AI call line (prompt version · cost · latency · view prompt).
- **Keyboard:** `j`/`k` move through the queue; `1`/`2`/`3` pick a verdict. Saving a verdict advances to the next open item. Done items stay in the list, struck through.
- **Verdicts:** "Same need ✓" (Confirm) is one click. "Belongs on another Problem" (Move) and "Needs its own Problem" (Split) open an inline form with a required note ("What makes these different needs?") and "Add as Regression case" ticked by default.
- **Window for the stats:** the prototype showed this session's agreement. The real window and definition belong to the `/review` metrics ticket.
- **Boundary-note suggestion:** C showed it as a step after a Move/Split (Accept / Edit / Dismiss). Whether and where it appears is decided by the Boundary-notes ticket.

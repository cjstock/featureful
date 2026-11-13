# 09: Assemble the v2 spec and build tickets

Type: task
Status: resolved
Blocked by: 02, 03, 04, 05, 06, 07, 08

## Question

Write `.scratch/v2/spec.md` (user stories, acceptance criteria, named seams, out of scope) and the vertical-slice build tickets under `.scratch/v2/issues/build/`, from the resolved tickets. Order and lane the tickets so the build fits 2 hours, with stretch items last. AFK, then a final check with the human.

Graduated from the map's fog: (1) the freshness/failure stretch: propose a definition of "stale" (e.g. Evidence added after `evaluatedAt`, or the last Evaluator AI call failed) and confirm it with the human at the final check; (2) the copy and placement for labelling Effort and Risk as AI estimates; (3) build order and parallel jj workspaces within the 2 hours, using the charter's lanes. Also: the AI call trace slice is heavy (helper + lint rule + table + budget + rate limit + off switch UI); split it if it won't fit one agent session.

## Answer

Resolved 2026-11-18 (task, with the final human check).

- **Spec:** [`.scratch/v2/spec.md`](../spec.md): 21 user stories, implementation decisions linked to their wayfinder tickets, testing decisions, out of scope, and the build plan.
- **Build tickets:** [`.scratch/v2/issues/build/`](build/), 12 tickets (01 rails → 02 eval + v1 baseline → 03 AI call seam → 04 Escalation → 05 inbox → 09 metrics on the critical path; 06 ablation, 07 budget/off switch, 08 delimiting and 10 Effort/Risk label in parallel; 11 freshness and 12 ledger as stretch). Each has a lane, blocking edges and a checklist. The trace/budget work is split across 03 and 07.
- **Confirmed with the human:**
  - Stale = Evidence newer than `evaluatedAt`; "Evaluation failed" = the latest Evaluator AI call wasn't `ok`; both offer "Re-evaluate".
  - The 2-hour plan is accepted as tight (estimate 2–2.5 hours), with this cut order: ledger → freshness → metrics Details → Effort/Risk label.

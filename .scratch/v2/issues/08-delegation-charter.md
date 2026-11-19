# 08: Delegation charter, risk lanes and PR template

Type: grilling
Status: resolved
Blocked by: none

## Question

How will v2 be built with agents in a way that matches MetaCTO's delivery practice?

- **Delegation charter:** for each kind of change, what agents prepare and what you decide, with a human decision owner for every ticket.
- **Green/Yellow/Red lanes:** which v2 areas land in which lane (likely Red: budget guard, role guards, the off switch; Green: UI), and the review depth for each lane.
- **PR template:** declaring AI involvement, the lane, the 10-check list or a subset of it, and the eval result.
- **Incident rules** promoted into `CLAUDE.md`: migrations on HMR, stale CSS after a jj rewrite, never stage `.env`.
- **Build ledger (stretch):** what's captured per ticket and from where (`prompts.txt` timestamps, agent usage, fix passes).

## Answer

Resolved 2026-11-18 (grilling).

1. **Charter home:** `docs/agents/delegation-charter.md`, linked from `CLAUDE.md`.
2. **Owner and lanes:** the human (repo owner) is the decision owner on every ticket; agents prepare.
   - 🟢 **Green** (UI layout, copy, styles, seed text, docs): automated checks + a skim of the diff or a screenshot.
   - 🟡 **Yellow** (prompts, eval harness and golden set, metrics queries, Match review queue logic): the human reads the diff plus the eval result vs the baseline.
   - 🔴 **Red** (budget guard, off switch, role guards on server actions, schema migrations, trace writes, CI workflow and secrets): line-by-line human review; failure-path tests required.
3. **Assignment:** the spec-assembly ticket stamps each build ticket with a `Lane:` line. A PR takes the highest lane it touches.
4. **PR shape:** one PR per build ticket targeting `v2`, with CI and the eval gate on each. A final `v2` → `main` PR summarises. CI must trigger on PRs targeting both `v2` and `main`.
5. **PR template** (`.github/pull_request_template.md`): ticket link; AI involvement (agent, model, what the human did); lane; diff inventory by area; the 10 checks as checkboxes with N/A allowed (requirement fidelity, real APIs only, dependency provenance, no secrets, input/output handling, authN/Z, error handling and observability, failure-path tests, no weakening of quality gates, architectural fit); eval result vs baseline when AI files change; "what this can't tell you".
6. **`CLAUDE.md` rules**, each with a one-line reason: never stage `.env` (check `jj st` before describing); after a schema change the DB client must re-run migrations (the cached `globalThis` connection survives hot reload); restart the dev server after jj rewrites CSS; no live AI calls outside the budget guard or a dry run.
7. **Automated checks before human review:** every PR runs lint, typecheck and test, plus the eval when AI files change. Yellow and Red PRs also get the `/code-review` standards and spec pass before the human looks; Green skips it.
8. **Build ledger (stretch):** `docs/build-ledger.md`, one row per build ticket: wall time (`prompts.txt` timestamps, PR open→merge), agent tokens and cost (subagent usage reports), app AI spend during the build (the trace record), fix passes, and accepted-without-fixes (Y/N). Timestamps, not self-reports.

**Handed on:** making the gate actually *block* merges (GitHub branch protection with required checks on `v2` and `main`) belongs to the Matcher eval harness and release gate ticket.

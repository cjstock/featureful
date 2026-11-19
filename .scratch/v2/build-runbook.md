# v2 build runbook (unattended overnight run)

You are the **orchestrator** for building Featureful v2. The human is asleep and wants **no interaction** until morning. Work through every build ticket in `.scratch/v2/issues/build/`, coordinating implementer subagents, and leave a clear morning report. Read this whole file first, then `.scratch/v2/spec.md`, `CLAUDE.md`, and each ticket when its turn comes.

## Standing authority (granted by the human, 2026-11-18)

- **Merge PRs into `v2`** once every gate below passes. **Never push to, merge into or open a PR against `main`.** The human reviews and merges `v2` → `main` in the morning.
- **Boundary-notes ablation (build ticket 06):** apply the agreed rule mechanically. **Keep** only if examples + notes beat examples-only by ≥2 boundary cases on **both** runs with no golden case regressing; otherwise **cut**. Record the numbers and the decision in ADR 0003, marked "decided by rule overnight; the human may overturn".
- **GitHub setup:** the `ANTHROPIC_API_KEY` repo secret is already set. After the `checks` job has run once (build ticket 01's PR), turn on branch protection on `v2` requiring `checks`. After `eval` has run once (build ticket 02's PR), add `eval` as required on `v2` and set the same rules on `main`. Do **not** require approving reviews, because agents must be able to merge. Use `gh api repos/cjstock/featureful/branches/<b>/protection`.
- **Hard spend cap: $5 of Anthropic API spend through `ANTHROPIC_API_KEY`** (app, eval and seed calls, local *and* CI), for the whole night. Agents' own Claude Code usage doesn't count. Track it in the status file from each eval report's cost line and each `ai_calls` sum. **Before any run that could cross $5, stop making AI calls**, finish what doesn't need them, and write the report. Never run the real seed (`npm run seed` without `--dry-run`); it isn't needed.

## How to run each ticket

1. **Pick the frontier:** tickets whose `Blocked by` tickets are all `Status: done`. Run **at most 3 implementers in parallel**. Critical path first: 01 → 02 → 03 → 04 → 05 → 09. Then 06, 07, 08 and 10 as they unblock. Stretch tickets 11 and 12 come last, and only if there's spend and time left.
2. **Isolate:** `jj git fetch`, then `jj workspace add ../featureful-b<NN> --name b<NN> -r v2@origin`. The implementer works only there. Symlink or `npm ci` its `node_modules` there, and copy `.env` (never stage it).
3. **Delegate:** spawn one implementer subagent per ticket with the full ticket path, the spec, `GLOSSARY.md`, `CLAUDE.md` and the delegation charter (once it exists), plus these rules:
   - follow the checklist
   - TDD at the named seams (the `mattpocock-skills:tdd` skill)
   - use glossary terms
   - `jj` only
   - Node: `export PATH=$HOME/.nvm/versions/node/v26.3.0/bin:$PATH` (nvm is lazy-loaded and absent in non-interactive shells)
   - run `npm run lint && npm run typecheck && npm test` before finishing
   - run `npm run eval` locally **only** when AI files changed, and report its cost
   - read `node_modules/next/dist/docs/` before Next.js-specific code (AGENTS.md)
   - no live AI calls except `npm run eval` and the ablation
4. **Open the PR:** the implementer describes the change (conventional commit + the attribution lines), creates bookmark `build/<NN>-<slug>`, runs `jj git push -b build/<NN>-<slug>` (no `--allow-new` flag in this jj), and runs `gh pr create --base v2`. The PR body follows `.github/pull_request_template.md` once ticket 01 lands, and the `mattpocock-skills:pr` skill. It declares AI involvement truthfully ("written by a Claude Opus 5.5 subagent, orchestrated by an agent, not yet human-reviewed").
5. **Gate:**
   - `gh pr checks <n> --watch` must be green.
   - **Yellow or Red lane:** run `/code-review` (standards + spec, the `mattpocock-skills:code-review` skill) on the PR diff against `v2@origin`.
   - Real findings go back to the implementer as a fix pass. **Allow at most 2 fix passes.**
6. **Merge or park.** If everything is green: `gh pr merge <n> --squash --delete-branch`, then `jj git fetch`, then set the ticket's `Status: done` with the PR link, commit that on a small `chore` PR or fold it into the next ticket's PR, and forget and delete the workspace. If it's still failing after 2 fix passes, or the eval gate blocks and the fix isn't obvious: **park it**. Leave the PR open and labelled `needs-human`, set `Status: needs-human` with a one-paragraph why, and continue with anything not blocked by it.
7. **Baseline updates** to `evals/baseline.json` are allowed only where a ticket says so, and must be explained in the PR. Never weaken a gate to get green.

## Logging and the morning report

- Append each orchestration step to `prompts.txt` (CLAUDE.md rule) as `(orchestration)` lines.
- Keep **`.scratch/v2/build-status.md`** current after every merge or park. It's the morning report, with these sections:
  - a table of tickets (status, PR link, lane, fix passes, AI spend)
  - running total spend vs $5
  - the ablation result
  - what needs the human (parked PRs, Red-lane items for the line-by-line review, branch-protection state)
  - a short "where the bottleneck moved" note
  - the exact next step
- When everything is done or parked: open **no** PR to `main`. The report's next step for the human is to review the Red-lane diffs and open the final `v2` → `main` PR.

## Stop conditions

Stop and write the report if any of these happen:
- the spend cap is about to be crossed
- the critical path is parked with nothing else unblocked
- a destructive or outward-facing action outside this authority seems necessary (e.g. force-push, deleting branches other than merged `build/*`, touching `main`, changing secrets)

Don't ask. The human is asleep. Leave it in the report.

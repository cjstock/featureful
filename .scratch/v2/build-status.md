# v2 build status: morning report (2026-11-18 → 19)

Orchestrated per [build-runbook.md](build-runbook.md). **Final state: stopped on the runbook condition "critical path parked with nothing else unblocked".** Ticket 04 is parked on the eval gate, and 05, 07 and 09 depend on it. Nothing was pushed to or opened against `main`.

## Tickets

| # | Ticket | Lane | Status | PR | Fix passes | AI spend |
|---|---|---|---|---|---|---|
| 01 | Build rails | 🔴 | done | [#2](https://github.com/cjstock/featureful/pull/2) | 1 (glossary wording, define AI files, CSS rule reason) | $0 |
| 10 | Effort/Risk AI estimate | 🟢 | done | [#1](https://github.com/cjstock/featureful/pull/1) | 0 (orchestrator fixed a spacing nit; render-checked PM vs Customer) | $0 |
| 02 | Eval harness + v1 baseline | 🔴 (CI) | done | [#3](https://github.com/cjstock/featureful/pull/3) | 1 (hard cost cap, reason on new-flips, regression.json validation, CI concurrency) | $0.62 |
| 03 | AI call seam | 🔴 | done | [#4](https://github.com/cjstock/featureful/pull/4) | 1 (Brief quote bound vs new cap, original error always rethrown, decision→AI call link tightened, action-level role test) | $0.63 |
| 06 | Boundary-notes ablation → **CUT** | 🔴 (migration) | done | [#8](https://github.com/cjstock/featureful/pull/8) | 1 (archive runner branch, ADR provenance, retired module uncallable) | $1.21 |
| 08 | Delimit Customer text | 🔴 (CI filter) | done | [#6](https://github.com/cjstock/featureful/pull/6) | 1 (dropped a cost-rule loosening, escape every `<`, author name inside the tag, filter gaps) | $0.67 |
| 11 | (Stretch) Evaluation freshness | 🟡 | done | [#7](https://github.com/cjstock/featureful/pull/7) | 1 (`evaluatedAt` stamped before reading Evidence, dedup query, copy) | $0.23 |
| 12 | (Stretch) Build ledger | 🟢 | done | closing chore PR | — | $0 |
| 04 | Escalation | 🔴/🟡 | **needs-human (parked)** | [#5](https://github.com/cjstock/featureful/pull/5) | 0 (no review yet; gate question first) | $0.48 |
| 05 | Escalation inbox | 🟢 | blocked by 04 | | | |
| 07 | Budget, rate limit, off switch | 🔴 | blocked by 04 | | | |
| 09 | Inbox metrics | 🟡 | blocked by 05, 07 | | | |

## Spend

Running total: **$3.83 / $5.00** (Anthropic API via `ANTHROPIC_API_KEY`, local + CI). No seed was run.

| When | What | Cost |
|---|---|---|
| 2026-11-18 21:16 | Key check (1 Haiku call, 11 tokens) at the human's request | <$0.0001 |
| 2026-11-18 ~21:35 | Ticket 02: local baseline run (39 calls) | $0.2090 |
| 2026-11-18 21:37 | Ticket 02: CI eval on PR #3 (39 calls) | $0.2060 |
| 2026-11-18 ~21:45 | Ticket 02: CI eval after fix pass 1 | $0.2084 |
| 2026-11-18 ~21:55 | Ticket 06: Boundary notes written once (14 calls) | $0.0429 |
| 2026-11-18 ~22:00 | Ticket 06: ablation, 3 arms × 2 runs (60 calls) | $0.5046 |
| 2026-11-18 ~22:00 | Ticket 03: local eval | $0.2058 |
| 2026-11-18 22:05 | Ticket 03: CI eval on PR #4 | $0.2098 |
| 2026-11-18 ~22:15 | Ticket 03: CI eval after fix pass 1 | $0.2124 |
| 2026-11-19 ~09:40 | Ticket 04: local eval (PASS, identical to baseline) | $0.2362 |
| 2026-11-19 09:47 | Ticket 04: CI eval on PR #5 (FAIL: replay F1 0.750) | $0.2396 |
| 2026-11-19 ~09:52 | Ticket 08: local eval (41 calls) | $0.2257 |
| 2026-11-19 09:54 | Ticket 08: CI eval on PR #6 | $0.2265 |
| 2026-11-19 ~10:04 | Ticket 08: CI eval after fix pass 1 | $0.2213 |
| 2026-11-19 ~10:20 | Ticket 06: local eval after cut | $0.2243 |
| 2026-11-19 ~10:25 | Ticket 06: CI eval on PR #8 | $0.2210 |
| 2026-11-19 ~10:35 | Ticket 11: CI eval after fix pass 1 (evaluator.ts touched) | $0.2254 |
| 2026-11-19 ~10:18 | Ticket 06: CI eval after fix pass 1 | $0.2149 |

## Ablation result

**Decision by rule: CUT** (examples + notes did not beat examples-only by ≥2 boundary cases on both runs). Recorded in ADR 0003 as "decided by rule overnight; the human may overturn".

| Run | (a) neither | (b) examples | (c) examples + notes | (c) − (b) | Golden regressions |
|---|---|---|---|---|---|
| 1 | 8/8 | 8/8 | 8/8 | +0 | none |
| 2 | 7/8 | 8/8 | 8/8 | +0 | none |

Cost per Request: (a) $0.0052, (b) $0.0083, (c) $0.0109 (notes add ~31% over examples alone).

⚠️ **Ceiling effect, read this before accepting the cut:** arm (a) with no help at all already scored 8/8 and 7/8, so the case set could not produce a +2 margin; this test could only ever say CUT. What it shows: on these 8 cases notes added nothing and cost more. What it can't show: that notes never help on harder lines. Cases and reviews were written by the same agent. I did not re-run with harder cases (the rule was fixed in advance and re-running to chase a different answer would be goal-seeking). If you want to overturn: keep the ablation runner, write harder cases, rerun (~$0.50).

## Needs the human

1. **PR #5 (ticket 04, Escalation) is parked. It's on the critical path and blocks 05, 07 and 09.** The CI eval gate failed on replay F1: 0.750 vs 0.846, where the limit is −0.05. One extra Problem was created (recall 0.733 → 0.600, precision 1.000), the fixed-state cases were identical, and the local run of the same commit matched the baseline exactly.
   - *Evidence since:* PRs #6, #7 and #8 each produced replay F1 **1.000 in CI** and **0.846 locally** on the same commit, with identical fixed-state cases. The 26-Request replay swings ±0.1–0.15 per split, which is wider than the gate.
   - *Decide:* whether to change the F1 gate's design before re-running #5, for example the mean of N replays, `temperature: 0` for the Matcher in the eval, or a wider threshold. That's a gate change, which the runbook keeps for you. Then re-run #5's eval. It still needs the Red-lane `/code-review` and your line-by-line review.
   - *Migration clash:* #5 adds a migration numbered `0003`, and v2 already has `0003_drop_boundary_note` (from #8). Rebase #5 onto v2, renumber it to `0004` and regenerate its drizzle snapshot. Its workspace is still at `../featureful-b04`.
2. **Accept or overturn the Boundary-notes CUT (ADR 0003).** It was decided by rule, but the test hit its ceiling and could never have produced KEEP. Also check `evals/matcher/ablation/boundary-notes.json` by eye; the ticket's human check is still open. Migration `0003` drops stored notes, which is a one-way door for data once it reaches `main`. The runnable record is branch `archive/06-ablation-runner` (64581dd9; never merge it).
3. **Red-lane line-by-line review** (charter) before `v2` → `main`. Every one of these is merged into `v2`, but none is human-reviewed:
   - [#2](https://github.com/cjstock/featureful/pull/2): the CI workflow
   - [#3](https://github.com/cjstock/featureful/pull/3): the CI eval job and secret use
   - [#4](https://github.com/cjstock/featureful/pull/4): the `ai_calls` migration, AI call writes, the PM-only "view prompt"
   - [#6](https://github.com/cjstock/featureful/pull/6): the CI filter and the AI call `related` write
   - [#8](https://github.com/cjstock/featureful/pull/8): the column-drop migration
   
   Yellow: [#7](https://github.com/cjstock/featureful/pull/7). Green, skim: [#1](https://github.com/cjstock/featureful/pull/1).
4. **Judgement calls to confirm:**
   - **Incident rule wording:** the four incident-rule reasons in `CLAUDE.md` were written from the ticket; check they match what happened in v1.
   - **Baseline commit:** `evals/baseline.json`'s `commit` was set by hand to `839c378e`.
   - **AI call outcomes:** `aiGenerate` takes extra `db`/`model`/`meter`/`shownProblems` params and stores a `system` column.
   - **Output caps:** app AI calls now have per-module output caps (the Brief writer's quotes are bounded to 300 chars to fit).
   - **Adversarial cases:** both adversarial Matcher cases were promoted to `must`.
   - **Node in CI:** CI uses Node 26, while `engines` says `>=22`.
5. **Known gaps / follow-ups:**
   - **App AI spend is uncapped until ticket 07.** App AI calls are recorded but have no budget, because ticket 07 is blocked.
   - **Other writers aren't delimited:** the Brief and Decision-note writers still pass Customer text untagged, and AI-written Problem titles and needs aren't tagged.
   - **Moved Requests and freshness:** a Request moved by Match review keeps its old `createdAt`, so it doesn't make the destination Problem stale.
   - **Your local DB is behind:** `data/featureful.db` is behind on migrations. It will migrate on the next app start, and will drop `boundary_note` then.
6. **Branch protection:** `v2` and `main` both require `checks` + `eval`. No reviews are required, and `enforce_admins` is off, so you as admin can bypass.

## Incidents

- **2026-11-18 ~22:20 → 2026-11-19 09:46: usage-limit stop.** The Claude Code 5-hour usage limit stopped the whole run, just after the ticket 04 implementer's local eval. Nothing ran for about 11.5 hours, and no work or spend was lost. Times in the spend table come from PR timestamps and `prompts.txt` (approximate where marked ~).

## Where the bottleneck moved

See [docs/build-ledger.md](../../docs/build-ledger.md). In short:
- **Review first.** Every Red or Yellow PR had at least one real defect, and each was fixed in a single pass.
- **Then eval spend.** Single-push discipline, because each push to an AI-file PR costs ~$0.22.
- **Now eval noise.** The replay F1 gate is noisier than its threshold, and that parked the critical path. The next move is a gate-design decision, not more agent work.

## Next step

1. Decide the F1-gate question (item 1). Then unpark #5: rebase it, renumber its migration to `0004`, re-run its eval, and run `/code-review`. That unblocks 05 and 07, then 09. Budget left is about $1.17, which covers roughly two more tickets with one local and one CI eval each.
2. Accept or overturn the Boundary-notes cut (item 2).
3. Review the Red-lane diffs line by line (item 3), then open the final `v2` → `main` PR yourself. No PR to `main` was opened.

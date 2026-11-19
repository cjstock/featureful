# v2 build status: final report (2026-11-18 21:16 → 2026-11-19 ~12:20)

Orchestrated per [build-runbook.md](build-runbook.md). **All 12 build tickets are done and merged into `v2`.** Nothing was pushed to, merged into or opened against `main`. The final `v2` → `main` PR is yours to open, after the reviews below.

## Tickets

| # | Ticket | Lane | Status | PR | Fix passes | AI spend |
|---|---|---|---|---|---|---|
| 01 | Build rails | 🔴 | done | [#2](https://github.com/cjstock/featureful/pull/2) | 1 (glossary wording, define AI files, CSS rule reason) | $0 |
| 10 | Effort/Risk AI estimate | 🟢 | done | [#1](https://github.com/cjstock/featureful/pull/1) | 0 (orchestrator fixed a spacing nit; render-checked) | $0 |
| 02 | Eval harness + v1 baseline | 🔴 (CI) | done | [#3](https://github.com/cjstock/featureful/pull/3) | 1 (hard cost cap, reason on new-flips, regression.json validation, CI concurrency) | $0.62 |
| 03 | AI call seam | 🔴 | done | [#4](https://github.com/cjstock/featureful/pull/4) | 1 (Brief quote bound, original error rethrown, decision→AI call link tightened, action role test) | $0.63 |
| 06 | Boundary-notes ablation → **CUT** | 🔴 (migration 0003) | done | [#8](https://github.com/cjstock/featureful/pull/8) | 1 (archive runner branch, ADR provenance, retired module uncallable) | $1.21 |
| 08 | Delimit Customer text | 🔴 (CI filter) | done | [#6](https://github.com/cjstock/featureful/pull/6) | 1 (dropped a cost-rule loosening, escape every `<`, author inside the tag, filter gaps) | $0.67 |
| 11 | (Stretch) Evaluation freshness | 🟡 | done | [#7](https://github.com/cjstock/featureful/pull/7) | 1 (`evaluatedAt` stamped before reading Evidence, dedup query) | $0.23 |
| 04 | Escalation | 🔴 (migration 0004) | done | [#5](https://github.com/cjstock/featureful/pull/5) | 1 (Escalation reasons derived server-side, High-Demand boundary, role test, eval:pull safety); parked 09:51–10:28 on a noisy F1 gate | $0.98 |
| 05 | Escalation inbox | 🟢 | done | [#10](https://github.com/cjstock/featureful/pull/10) | 0 | $0 |
| 07 | Budget, rate limit, off switch | 🔴 (migration 0005) | done | [#11](https://github.com/cjstock/featureful/pull/11) | 1 (propose rate limit, conservative worst case, per-module availability, seed/eval need a meter, fail-closed tests) | $0.73 |
| 09 | Inbox metrics | 🔴 (migration 0006) | done | [#12](https://github.com/cjstock/featureful/pull/12) | 1 (real `first_decided_at` instead of a biased proxy, bounded query, n labels, tests) | $0.25 |
| 12 | (Stretch) Build ledger | 🟢 | done | [#9](https://github.com/cjstock/featureful/pull/9) + this closing PR | — | $0 |

## Spend

**Total: $5.33** (Anthropic API via `ANTHROPIC_API_KEY`, local + CI, all `source: eval`). No seed was run.
- **Cap history:** the cap was $5 overnight. At ~10:36 on 11-19 you raised it to "whatever is left of the $10" and reported a $4.65 balance when spend was $4.09.
- **Estimated balance now:** about **$3.41**. The key can't read the balance; check it in Console → Billing.

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
| 2026-11-19 ~10:33 | Ticket 04: CI eval after rebase + 0004 renumber (PASS, identical to baseline) | $0.2553 |
| 2026-11-19 ~10:46 | Ticket 04: CI eval after fix pass 1 (PASS) | $0.2529 |
| 2026-11-19 ~11:35 | Ticket 07: local eval (stopped: network timeout on one call) | $0.2212 |
| 2026-11-19 11:40 | Ticket 07: CI eval on PR #11 (PASS; cost +23.1% vs baseline) | $0.2572 |
| 2026-11-19 ~11:52 | Ticket 07: CI eval after fix pass 1 (PASS; +20.7%) | $0.2523 |
| 2026-11-19 ~12:10 | Ticket 09: CI eval after fix pass 1 (migration 0006 touched schema.ts) | $0.2531 |

## Ablation result

**Decision by rule: CUT** (examples + notes did not beat examples-only by ≥2 boundary cases on both runs). Recorded in ADR 0003 as "decided by rule overnight; the human may overturn".

| Run | (a) neither | (b) examples | (c) examples + notes | (c) − (b) | Golden regressions |
|---|---|---|---|---|---|
| 1 | 8/8 | 8/8 | 8/8 | +0 | none |
| 2 | 7/8 | 8/8 | 8/8 | +0 | none |

Cost per Request: (a) $0.0052, (b) $0.0083, (c) $0.0109 (notes add ~31% over examples alone).

⚠️ **Ceiling effect, read this before accepting the cut:** arm (a) with no help at all already scored 8/8 and 7/8, so the case set could not produce a +2 margin; this test could only ever say CUT. What it shows: on these 8 cases notes added nothing and cost more. What it can't show: that notes never help on harder lines. Cases and reviews were written by the same agent. I did not re-run with harder cases (the rule was fixed in advance and re-running to chase a different answer would be goal-seeking). If you want to overturn: keep the ablation runner, write harder cases, rerun (~$0.50).

## Needs the human

1. **Accept or overturn the Boundary-notes CUT (ADR 0003).** It was decided by rule, but the test hit its ceiling: arm (a) already scored 8/8 and 7/8, so KEEP was impossible.
   - Check `evals/matcher/ablation/boundary-notes.json` by eye; that check is still open.
   - Migration `0003` drops stored notes, which can't be undone once it's on `main`.
   - The runnable record is branch `archive/06-ablation-runner` (64581dd9). Never merge it.
2. **Red-lane line-by-line review** (charter) before `v2` → `main`. Everything is merged into `v2` and nothing is human-reviewed yet.
   - **🔴 Red:**
     - [#2](https://github.com/cjstock/featureful/pull/2): CI
     - [#3](https://github.com/cjstock/featureful/pull/3): CI eval + secret
     - [#4](https://github.com/cjstock/featureful/pull/4): `ai_calls` migration, AI call writes, PM-only view prompt
     - [#5](https://github.com/cjstock/featureful/pull/5): migration 0004, backfill, server-derived Escalation
     - [#6](https://github.com/cjstock/featureful/pull/6): CI filter
     - [#8](https://github.com/cjstock/featureful/pull/8): column drop
     - [#11](https://github.com/cjstock/featureful/pull/11): budget guard, off switch, role guards, rate limits, migration 0005
     - [#12](https://github.com/cjstock/featureful/pull/12): migration 0006
   - **🟡 Yellow:** [#7](https://github.com/cjstock/featureful/pull/7)
   - **🟢 Green (skim or click through):** [#1](https://github.com/cjstock/featureful/pull/1), [#10](https://github.com/cjstock/featureful/pull/10). Nobody has clicked through #10's inbox in a browser: press `1` on an item, do a Move with a note, and check the strikethrough and auto-advance.
3. **Gate design (two issues):**
   - **Replay F1 is noisier than its gate.** The same commit scored F1 0.846 locally and 1.000 in CI; one split is ±0.1–0.15 against a −0.05 threshold. Options: the mean of N replays, `temperature: 0` for the eval Matcher, or a wider threshold. That's a gate change, so it's your call.
   - **The cost gate is nearly full.** v2's eval runs at $0.25–0.26, +21–23% vs v1's $0.209, because 08 added the injection check and 04 added `closestProblem`. The next AI-file change may trip the 25% limit on cost alone. Re-recording `evals/baseline.json` on v2 would need a Yellow PR, which no ticket authorised.
4. **Open questions in the PRs:**
   - **Escalation agreement excludes spot checks** (#12).
   - **High-Demand threshold** (#5): ≥5 supporters counting the merge.
   - **Proposal rate limit** (#11): 20 per hour, 2× the submit limit.
   - **Writer and Re-evaluate buttons** (#11): disabled per module when the module's worst case won't fit today's budget.
   - **Inbox verdict keys** (#10): on its-own-Problem cards, key `1` is "Belongs on an existing Problem".
5. **Judgement calls to confirm:**
   - the `CLAUDE.md` incident-rule reasons
   - `evals/baseline.json`'s hand-set `commit` (`839c378e`)
   - `aiGenerate`'s extra params and `system` column
   - per-module output caps, with the Brief writer's quotes bounded to 300 chars
   - both adversarial cases are `must`
   - CI uses Node 26, though `engines` allows >=22
6. **Known gaps and follow-ups:**
   - The Brief and Decision-note writers still pass Customer text untagged, and AI-written Problem titles and needs aren't tagged either.
   - A Request moved by Match review keeps its old `createdAt`, so it doesn't make its destination Problem stale.
   - The budget's in-flight reservation is per process.
   - Time to decision reads "too few" until 10 Problems are decided after #12; the seed sets Statuses directly, so seeded Problems stay untimed.
   - "AI controls", "off switch", "daily budget" and "Escalation agreement" aren't in `GLOSSARY.md` yet.
   - Your local `data/featureful.db` is behind on migrations 0002–0006. It migrates on the next app start, and that drops `boundary_note`.
7. **Branch protection:** `v2` and `main` both require `checks` + `eval`, with no required reviews. `enforce_admins` is off, so you as admin can bypass.

## Incidents

- **Usage-limit stop, 2026-11-18 ~22:20 → 2026-11-19 09:46.** The Claude Code 5-hour usage limit stopped the whole run. Nothing ran for ~11.5 h, and no work or spend was lost.
- **Parked on noise, 2026-11-19 09:51 → 10:28.** PR #5 was parked when the CI eval failed on replay F1 noise. You asked me to continue without you; its required rebase (migration renumber) re-ran the eval, which passed with every score identical to the baseline. Then it got its review and fix pass.
- **Network error, 2026-11-19 ~11:10.** A network error (EAI_AGAIN) killed the ticket 07 implementer. It was resumed from saved state.
- **Second usage-limit stop, 2026-11-19 ~11:26.** The limit stopped the run again. You reset it, and the implementer resumed.
- **Aborted local eval, 2026-11-19 ~11:35.** Ticket 07's local eval stopped on a network timeout after 36 calls ($0.22 spent). It wasn't retried; CI ran the gate.

## Where the bottleneck moved

See [docs/build-ledger.md](../../docs/build-ledger.md).
- **Review first.** 9 of the 11 ticket PRs needed exactly one fix pass for real defects; the two Green UI PRs needed none.
- **Then eval spend and noise.** Single pushes and CI-only evals kept spend down. The replay F1 noise parked the critical path for a while.
- **Now human decisions.** The gate's design, the Boundary-notes cut, and the Red-lane reviews.

## Next step

1. Review the Red-lane PRs line by line (item 2) and decide the Boundary-notes cut (item 1).
2. Decide the two gate-design issues (item 3) before the next prompt change.
3. Open the final `v2` → `main` PR yourself.

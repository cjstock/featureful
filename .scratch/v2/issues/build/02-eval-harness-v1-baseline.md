# 02: Matcher eval harness and the v1 baseline

**What to build:** `npm run eval`:
- replays the seed Requests through intake and scores the groupings against `SEED_REQUESTS[].group`
- runs fixed-state cases from `evals/matcher/cases.ts`
- compares against `evals/baseline.json`
- prints a report and fails on a gate breach

It runs on the **unchanged v1 Matcher prompt**, and the first result is committed as the baseline. CI gets the path-filtered `eval` job. Detail: [eval ticket](../03-matcher-eval-harness.md).

**Lane:** 🟡 Yellow (🔴 for the CI edit)

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Replay: an in-memory DB, seed Requests in order, submitter always accepts. Scores pairwise precision, recall and F1, plus Problems created vs 16.
- [ ] `evals/matcher/cases.ts`: typed `{ id, kind: golden|boundary|adversarial|regression, must, source, problems, request, expected }`. About 12–15 cases to start, including the two adversarial injections (force a match to Problem 1; force a new Problem). Also loads `evals/matcher/regression.json` (starts as `[]`).
- [ ] Scores: match-vs-new accuracy, correct-Problem accuracy, AI calls and cost (from token usage × config prices). There's no `aiGenerate` yet, so this slice uses a local call counter capped at 60 calls or $1.
- [ ] Gate: blocks on a `must` case failing, F1 more than 0.05 below baseline, a baseline-passing case now failing, or cost per run up more than 25%. The Evaluator injection pair is added in the delimiting ticket.
- [ ] Report: a scores-vs-baseline table, the flipped cases (old answer, new answer, the Matcher's reason) and cost. Written to `$GITHUB_STEP_SUMMARY` in CI and stdout locally.
- [ ] `npm test` (offline): an oracle Matcher scores 100% and passes; a null "always new" Matcher fails the gate.
- [ ] CI: an `eval` job gated by `dorny/paths-filter` + `if:` over `src/lib/ai.ts`, `src/lib/config.ts`, `src/lib/intake/**`, `src/lib/evaluator.ts`, `src/lib/match-review.ts`, `evals/**`, `scripts/eval.ts` and `package-lock.json`. It fails when AI files changed but the secret is missing.
- [ ] `evals/baseline.json` is committed from a real run on the v1 prompt, with the commit and cost recorded. The PR states the v1 numbers.
- [ ] Orchestrator (per the build runbook): once `eval` has run, add it to the required checks on `v2`, and set the same protection on `main`.

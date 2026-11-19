# Delegation charter

How Featureful is built with agents: what agents prepare, what the human decides, and how deeply each change is reviewed.

## Who decides

The human (the repo owner) is the **decision owner on every ticket**. Agents prepare: they write the code, tests, docs and PR, run the checks, and say what they could not verify. Agents never merge to `main`, and a PR is never treated as reviewed until the human has reviewed it at the depth its lane requires.

## Lanes

Every build ticket carries a `Lane:` line. A PR takes the **highest lane it touches**: a UI change that also edits the CI workflow is Red.

| Lane | What's in it | Review depth |
| --- | --- | --- |
| 🟢 **Green** | UI layout, copy, styles, seed text, docs | Automated checks pass, plus a skim of the diff or a screenshot. |
| 🟡 **Yellow** | Prompts, the eval harness and golden set, metrics queries, Match review queue logic | The human reads the diff plus the eval result against the baseline. |
| 🔴 **Red** | Budget guard, off switch, role guards on server actions, schema migrations, AI call writes, CI workflow and secrets | Line-by-line human review. Failure-path tests are required (over budget, switched off, the role guard, a migration on existing data). |

## Before the human looks

- Every PR runs lint, typecheck and test in CI (the `checks` job). PRs that change AI files also run the Matcher eval (the `eval` job, `npm run eval`), gated against `evals/baseline.json`.
- **AI files** are `src/lib/ai.ts`, `src/lib/config.ts`, `src/lib/intake/**`, `src/lib/evaluator.ts`, `src/lib/match-review.ts`, `src/lib/customer-text.ts`, `src/lib/evidence-prompt.ts`, `evals/**`, `scripts/eval.ts` and `package-lock.json` (the eval job's path filter, which also watches `.github/workflows/ci.yml` itself).
- Yellow and Red PRs also get the `/code-review` standards and spec pass; Green skips it.

## PR shape

- One PR per build ticket, targeting `v2`, using [the PR template](../../.github/pull_request_template.md). It declares AI involvement, the lane, the 10 checks and the eval result.
- A final `v2` → `main` PR summarises the build.

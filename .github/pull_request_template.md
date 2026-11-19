<!-- Lanes and review depth: docs/agents/delegation-charter.md -->

## Ticket

<!-- Link the build ticket, e.g. .scratch/v2/issues/build/NN-slug.md -->

## AI involvement

- **Agent:** <!-- e.g. Claude Code subagent, orchestrated by an agent; or "none" -->
- **Model:** <!-- e.g. Claude Opus 5.5 -->
- **What the human did:** <!-- e.g. wrote the ticket; not yet human-reviewed -->

## Lane

<!-- 🟢 Green / 🟡 Yellow / 🔴 Red. A PR takes the highest lane it touches. -->

## Diff inventory

<!-- Files changed, grouped by area (UI, lib, db/migrations, prompts, evals, CI, docs). -->

## The 10 checks

<!-- Tick each, or write N/A with a one-line reason. -->

- [ ] Requirement fidelity: does what the ticket asks, no more, no less
- [ ] Real APIs only: no invented functions, flags or endpoints
- [ ] Dependency provenance: new dependencies are real, maintained and needed
- [ ] No secrets: nothing from `.env`, no keys or tokens in code, logs or fixtures
- [ ] Input/output handling: untrusted input validated; output escaped or delimited
- [ ] AuthN/Z: role guards on every server action that needs one
- [ ] Error handling and observability: failures surface clearly and are traceable
- [ ] Failure-path tests: the ways it can go wrong are tested (required for Red)
- [ ] No weakening of quality gates: lint, types, tests, eval and CI untouched or stricter
- [ ] Architectural fit: follows the existing seams, glossary terms and ADRs

## Eval result vs baseline

<!-- When AI files change: paste the `npm run eval` summary and the diff against the baseline, plus the cost line. Otherwise: N/A (no AI files changed). -->

## What this can't tell you

<!-- What the checks and tests don't cover, judgement calls, and anything the reviewer should verify by hand. -->

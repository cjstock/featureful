# Map: Featureful v2, the operating system around the model

Type: map (wayfinder:map)

## Destination

A handoff-ready v2 spec (`.scratch/v2/spec.md`) and vertical-slice build tickets (`.scratch/v2/issues/build/`) on the `v2` branch. Together they evolve v1 into a build that holds up against MetaCTO's AI-engineering practice: evals as a gate, traced and metered AI calls, controls in infrastructure, a Match review loop and Boundary notes that justify themselves with measurable outcomes, and a build process that measures itself. The build must fit about **2 hours** and **$20 of API spend in total** (shared with v1's pool), and v2 must still be a valid answer to `ASSIGNMENT.md`.

## Notes

- **Domain:** Featureful (`GLOSSARY.md`, `docs/adr/`, `.scratch/mvp/spec.md`). Use the glossary's language and update it inline when a term changes (the domain-modeling skill).
- **The yardstick:** `~/projects/metacto-interview-prep/01-metacto-ai-canon.md` (the beliefs; §3.6–3.9 and §3.10 matter most) and `03-assessment-featureful.md` (scores, critiques and improvements #1–#7). v2 should move B4–B8 and A4/A6/A7.
- **Skills:** grilling + domain-modeling for grilling tickets; prototype for prototype tickets; research for research tickets; codebase-design when placing seams (the AI-call seam, the eval runner).
- **Standing decisions from charting (2026-11-18):**
  - Evolve v1, don't rebuild. Branch `v2` from `main`. Keep every v1 feature working.
  - **Product lens, in scope:** Matcher eval harness + CI gate; AI call trace (model, prompt version, tokens, cost, latency, outcome, related id; prompt version also stored on Matching decisions); budget guard (daily $ cap, per-person submit limit, hard stop with a clear UI error); untrusted-text delimiting + adversarial eval cases; instrumented metrics on `/review`; a per-module AI off switch owned by the PM; the Match review + Boundary notes redesign.
  - **Build lens, in scope:** delegation charter (Green/Yellow/Red lanes, a human decision owner per ticket); a PR template declaring AI involvement and the lane, with v2 landing on `main` through a reviewed PR; v1 incident rules promoted into `CLAUDE.md`.
  - **Stretch items (built last, cut first):** evaluation freshness/failure state; the build ledger (time, cost and accepted-without-fixes per ticket).
  - **Eval gate:** GitHub Actions runs lint, typecheck and test on every PR, plus `npm run eval` when prompt or AI files change. The API key is a repo secret. The same command runs locally.
  - **Eval scope:** Matcher golden set (grouping precision/recall, new-vs-match) plus adversarial, boundary and regression cases. Evaluator: injection resistance only. Brief, Decision note and Boundary-note writer outputs: no eval, because a human edits them.
  - **Baseline first:** the first eval run is against the unchanged v1 Matcher; every later change is reported against it.
  - **Match review's job:** both quality control and a teaching signal, through a risk-ranked escalation queue. Outcomes: PM agreement rate, escalation rate (read as information), regression cases added.
  - **Boundary notes must earn their place:** an eval ablation (with vs without notes) decides keep, cut or replace. If they're kept, distillation becomes a visible suggestion the PM accepts or edits.

## Decisions so far

<!-- one line per resolved ticket: [title](issues/NN-slug.md): gist -->

- [Delegation charter, risk lanes and PR template](issues/08-delegation-charter.md): you own every decision; Green/Yellow/Red lanes set review depth (Red = line-by-line); one PR per build ticket into `v2` with an AI-declaring template; four incident rules go into `CLAUDE.md`; a timestamp-based build ledger as stretch.
- [Facts for one AI-call seam: SDK hooks, pricing, CI mechanics](issues/01-ai-call-seam-facts.md): one `wrapLanguageModel` middleware sees and can refuse all five modules' calls (once per retry attempt), with tags via `providerOptions`; sonnet-5-5 is $2/$10 per MTok and haiku-5-5 $0.10/$0.50; gate the eval with a job-level `if:` (a skipped job passes), not a workflow `paths` filter (stays Pending).
- [AI call trace, budget guard and off switch](issues/02-trace-budget-off-switch.md): one lint-enforced `aiGenerate` helper records every AI call (prompt-version hash, full content, tokens, cost, outcome), with no retries and per-module output caps; a $2/day app cap and a PM off switch per module both degrade the workflow (new Problem queued, "not evaluated") rather than block it; 10 submits per person per hour.
- [Matcher eval harness and release gate](issues/03-matcher-eval-harness.md): `npm run eval` = a seed replay scored by grouping F1 against the seed's `group` answer key, plus fixed-state golden/boundary/adversarial/regression cases; Customer text delimited in tags; blocks on must-case failures, F1 −0.05, baseline cases regressing, cost +25% or Evaluator injection; oracle/null Matchers prove the harness; CI job-level path filter plus branch protection; v1 is the baseline.
- [Match review as a risk-ranked escalation queue](issues/04-match-review-escalation.md): only Escalations reach the PM (bypassed, mine is different, high-Demand merge, low confidence, near miss via a new `closestProblem` Matcher field, 10% spot check), ranked by reason then oldest; each card shows the Problem's Evidence; Move/Split need a note and default to becoming Regression cases via `npm run eval:pull`; everything else is Auto-accepted.

## Not yet specified

- **Glossary changes still to come:** a possible successor to Boundary note (from the Boundary-notes ticket), and metric terms such as PM agreement rate (from the metrics ticket).
- **Freshness/failure state (stretch):** what "stale" means once Evidence changes after an evaluation, and what the PM sees. A failed Evaluator call is now a recorded AI call outcome (see the trace ticket), so the remaining question is what counts as "stale".
- **Labelling Effort and Risk as AI estimates:** copy and placement only. It likely goes straight into the spec.
- **Build order and parallelism inside the 2 hours:** which slices run in parallel jj workspaces. Lanes are now decided (see the delegation charter); the order still depends on the slice list.

## Out of scope

- **Model routing:** v2 keeps one model constant per module, with a one-line rationale for each. No router.
- **Embeddings or retrieval (ADR 0002 path to scale):** stays the documented path to scale.
- **Engineering context for Effort and Risk:** v2 only labels them as AI estimates.
- **A golden set for Evaluator quality**, and evals of the Brief, Decision note or Boundary-note writer outputs.
- **Building v2:** a separate effort that starts from the spec and tickets this map produces.
- **Interview prep docs** in `~/projects/metacto-interview-prep/`: updated separately, if at all.

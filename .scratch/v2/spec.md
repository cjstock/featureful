# Spec: Featureful v2, the operating system around the model

Status: ready-for-agent

Map: [Featureful v2](map.md). Each decision below links the wayfinder ticket that holds its full detail; this spec consolidates them, and the ticket wins if the two disagree.

## Problem Statement

Featureful v1 put AI at the right point: a Request becomes Evidence on a Problem at intake, numbers stay deterministic, and people make every consequential call. But you can't *prove* the Matcher works or notice when a prompt change breaks it. Nobody can say what an AI call cost or which prompt produced a decision, and in-app spend has no limit. Customer text goes into prompts undelimited. The PM's Match review queue is an undifferentiated list, and Boundary notes are rewritten invisibly with no evidence that they help. Nothing measures the outcomes, either of the product or of the agent-driven build itself.

## Solution

v2 keeps every v1 feature and adds the system around the model:

- **An eval harness that gates merges.** It replays the seed against an answer key the seed already contains, plus fixed-state golden, boundary, adversarial and regression cases. v1 is the baseline, and CI blocks a PR that makes things worse.
- **Every AI call recorded and metered** through one lint-enforced seam: prompt version, full content, tokens, cost and outcome.
- **Controls in infrastructure:** a daily budget, a per-person submit limit, and a PM off switch for each module. Running out of budget or switching a module off degrades the workflow instead of blocking it.
- **Match review rebuilt as an Escalation inbox.** Only risky decisions reach a PM. Each card shows the Problem's Evidence. Corrections become Regression cases.
- **Boundary notes on trial.** They stay only if an ablation shows they help, and then only as PM-accepted suggestions. (Cut: ADR 0003.)
- **Honest metrics on `/review`:** spot-check PM agreement rate, Escalation rate, cost per Request, and time to a decision.
- **A build process that holds itself to the same standard:** a delegation charter with risk lanes, a PR template that declares AI involvement, one PR per slice, and a build ledger.

## User Stories

### Eval and gate
1. As the developer, I run `npm run eval` locally and in CI and get grouping F1, case accuracy, cost, and a diff of flipped cases against the committed baseline.
2. As the developer, a PR that drops F1 by more than 0.05, fails a `must` case, regresses a baseline-passing case, raises cost per run by more than 25%, or lets an injected Request inflate the Evaluator's score cannot merge.
3. As the developer, I can trust the harness, because an oracle Matcher passes it and a null Matcher fails it in `npm test`.
4. As the developer, I export the Regression cases PMs marked with `npm run eval:pull` and commit them in a reviewed PR.

### AI calls, budget, controls
5. As a PM, every Matching decision and evaluation shows which prompt version made it, what it cost and how long it took, and I can view the prompt it was shown.
6. As a PM, AI spend can't exceed the daily cap. When it's reached, Requests still save (as new Problems, queued for me), Problems show "not evaluated" with the reason, and `/review` tells me when the budget resets.
7. As a PM, I can switch any AI module off from AI controls on `/strategy`, see who last flipped each switch and when, and the app keeps working without it.
8. As the team, a person can't submit more than 10 Requests an hour; past that, they're told when they can try again.

### Prompt safety
9. As a PM, Customer-written text can't instruct the Matcher or the Evaluator, and the eval proves it.

### Match review
10. As a PM, I only review Escalations, ranked by the strongest reason and then oldest first, and I can see why each one was escalated.
11. As a PM, each Escalation asks one question and shows the new Request beside the Problem's need and Evidence, so I can judge it without opening other pages.
12. As a PM, I clear the inbox with `j`/`k` and `1`/`2`/`3`: Confirm takes one click, Move and Split need a note, and saving moves on to the next item.
13. As a PM, my Move and Split reviews become Regression cases by default.
14. As a PM, I can still review any Auto-accepted decision.
15. (Conditional on the ablation; cut by ADR 0003, so not built) As a PM, after a Move or Split I see a suggested Boundary note revision as a diff, and nothing changes until I accept it.

### Metrics
16. As a PM, the inbox header shows spot-check PM agreement rate, Escalation rate and Regression cases marked, each with its n, its window and what it can't tell me; with n < 10, it says "too few".
17. As a PM, "Details" shows Escalation agreement, cost per Request, spend against the cap, refused AI calls, the last committed eval baseline, the median days to a decision, and the % of decided Problems with a Decision note.
18. As an Internal stakeholder, Effort and Risk are clearly labelled as AI estimates.

### Build process
19. As the developer, every build ticket names its lane, every PR declares AI involvement and runs the checks, and Red-lane PRs get my line-by-line review.
20. (Stretch) As a PM, a Problem whose evaluation failed, or that gained Evidence since it was last evaluated, says so and offers a re-evaluation.
21. (Stretch) As the developer, a build ledger records the time, cost and fix passes for each build ticket.

## Implementation Decisions

- **Seam** ([trace ticket](issues/02-trace-budget-off-switch.md)): `aiGenerate({ module, related, system, prompt, schema, maxOutputTokens })` in `src/lib/ai.ts` is the only place that imports `ai`, enforced by ESLint `no-restricted-imports`.
  - **No retries:** `maxRetries: 0`.
  - **Output caps:** set per module in config (Matcher 1,000, Evaluator 1,500, Boundary note 400, Decision note 800, Brief 2,500).
  - **Worst-case check before each call:** (prompt chars ÷ 4 × input price) + (cap × output price), against the remaining budget.
  - **Prices** come from a table in config: sonnet-5-5 $2/$10 per MTok, haiku-5-5 $0.10/$0.50 ([research](issues/01-ai-call-seam-facts.md)).
- **AI call record** (`ai_calls`): one row per attempt with module, model, prompt version (a short hash of the system prompt), tokens (no-cache, cache read, cache write, output), cost, latency, outcome (`ok | error | parse_failed | refused_budget | refused_off`), error message, the related record, the person who triggered it, source (`app | seed | eval`), the full rendered prompt and output, and the **structured Problems shown** to the Matcher.
  - Matching decisions store the prompt version and the AI call id.
- **Budget:** `AI_DAILY_BUDGET_USD` (default 2), counting `app` AI calls only and resetting at 00:00 UTC. Seed and eval keep their own per-run caps (eval: 60 calls or $1).
- **Rate limit:** 10 Request submissions per person per hour. Hitting it blocks the submission.
- **Off switch:** one row per module in a settings table, plus an audit table (who, when, on/off). PM-only server actions. What "off" or "out of budget" means for each module:
  - **Matcher:** a new Problem, with `matcherOutcome` set to `off`, `budget` or `failed`, so the decision is escalated as Bypassed.
  - **Evaluator:** "Not evaluated" with the reason.
  - **Writers:** their buttons are disabled with the reason.
- **Delimiting** ([eval ticket](issues/03-matcher-eval-harness.md)): Customer text goes inside `<request_title>`, `<request_description>` (including in Matching examples) and `<evidence>` tags, with closing tags escaped. The system prompts say tagged content is data. PM-written text stays untagged.
- **Eval** ([eval ticket](issues/03-matcher-eval-harness.md)):
  - **Replay answer key:** `SEED_REQUESTS[].group` (16 groups).
  - **Fixed-state cases:** `evals/matcher/cases.ts`, plus `evals/matcher/regression.json`.
  - **Runner:** `scripts/eval.ts`.
  - **Baseline:** `evals/baseline.json`, updated only by a Yellow-lane PR.
  - **Report:** a CI job summary, which also prints locally.
- **CI:** `.github/workflows/ci.yml` runs on PRs to `v2` and `main`.
  - `checks` runs lint, typecheck and test.
  - `eval` is gated by `dorny/paths-filter` and `if:`, so a skipped job passes. It fails if AI files changed and the secret is missing.
  - Branch protection requires both jobs.
- **Escalation** ([escalation ticket](issues/04-match-review-escalation.md)):
  - **Reasons and thresholds** (set in config), computed at confirm time and stored on the decision:
    - Bypassed
    - Mine is different
    - High-Demand merge: ≥5 supporters
    - Low confidence: below 0.75
    - Near miss: the new Matcher field `closestProblem` has confidence ≥0.4
    - Spot check: 10% of everything else
  - A migration backfills reasons for existing unreviewed decisions.
  - **Ranking:** by the strongest reason, then oldest first.
  - **Notes:** Move and Split require one.
  - **Confirm** becomes a Matching example only for the ambiguity reasons: mine is different, low confidence, near miss.
  - **Regression flag:** Move and Split carry an "Add as Regression case" flag, on by default.
- **Inbox UI** ([prototype ticket](issues/05-match-review-queue-prototype.md), prototype on `prototype/match-review-queue`):
  - Layout: a triage inbox with outcome stats on top. Variant B, with C's stats.
  - Verdict buttons: "Same need ✓", "Belongs on another Problem", "Needs its own Problem".
  - A bypassed decision asks "Group this Request".
- **Boundary notes** ([ablation ticket](issues/06-boundary-notes-earn-their-place.md)):
  - A three-arm ablation (none / examples / examples + notes), with each arm run twice.
  - Notes stay only if they win by ≥2 boundary cases on both runs, with no golden case regressing. The human decides.
  - **If kept:** Suggest-level, with revision records.
  - **If cut:** removed entirely.
  - ADR 0003 records the result.
  - **Result: cut** ([ADR 0003](../../docs/adr/0003-boundary-notes-on-ablation-evidence.md), decided by rule overnight 2026-11-18; the human may overturn). (c) − (b) was +0 on both runs. The writer, prompt section, editor, background distillation and column are removed.
- **Metrics** ([metrics ticket](issues/07-review-metrics.md)):
  - PM agreement rate = Confirms ÷ spot-check reviews, over the last 30.
  - Escalation rate covers the last 7 days.
  - Regression cases marked covers the last 30 days.
  - Cost per Request covers Requests from the last 7 days.
  - Time to decision = median days from a Problem's first Request to its first non-Open Status.
- **Freshness (stretch):** a Problem is **stale** when it has Evidence newer than `evaluatedAt`. It shows **"Evaluation failed"** when its latest Evaluator AI call didn't return `ok`. Both offer "Re-evaluate".
- **Effort/Risk label:** an "AI estimate" tag beside the Effort and Risk scores on the Problem page and the score breakdown, with a tooltip saying the AI hasn't seen the codebase.

## Testing Decisions

- **Unit tests** cover `aiGenerate` with a mock model: tracing, refusals over budget and when switched off, parse failures, and cost maths. They also cover the escalation-reason computation and ranking, the metrics queries (including the n < 10 rule), and the rate limit.
- **Module fakes stay.** Intake, Match review and the Evaluator are tested through their existing fakes.
- **Harness validation** runs in `npm test`: the oracle Matcher passes and the null Matcher fails.
- **The eval itself** costs money, so it runs only when AI files change. It's never part of `npm test`.
- **Red-lane slices** need tests of the failure paths: over budget, switched off, the role guard, and a migration on existing data.

## Out of Scope

Carried over from the map:
- model routing
- embeddings and relevance-based Matching examples (ADR 0002's path to scale)
- engineering context for Effort and Risk
- an Evaluator-quality golden set
- evals of writer output
- a separate AI-call log page
- PR comments from CI

The interview prep docs are also out of scope.

## Build plan

Two hours of human time and about **$20 total** API spend (v1 used little of the first $10; expect under $6 for v2: roughly 8 eval runs, the ablation and one seed). Tickets are in [`issues/build/`](issues/build/). There's **one PR per ticket** into `v2`, using the PR template, and a final `v2` → `main` PR at the end.

The critical path is: Build rails → Eval harness and v1 baseline → AI call seam → Escalation → Escalation inbox → Inbox metrics.

These run in parallel jj workspaces alongside the critical path:
- Delimiting, after the AI call seam
- Budget and off switch, after Escalation
- The Boundary-notes ablation, after the eval harness
- The Effort/Risk label, at any time

Stretch items (freshness, ledger) come last and are cut first. If time runs short, the next cut is the Details disclosure in the metrics ticket, keeping the header strip.

## Further Notes

- Glossary: AI call, Escalation, Escalation reason, Auto-accepted, Regression case, PM agreement rate and Escalation rate were added during wayfinding. The Boundary note entry was removed after the ablation (ADR 0003).
- Run `jj st` before describing a change, and never stage `.env`.

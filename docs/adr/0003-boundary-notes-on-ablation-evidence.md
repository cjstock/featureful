# Boundary notes are cut: the ablation showed no gain over Matching examples

**Decided by rule overnight (2026-11-18); the human may overturn.** This amends step 3 of [ADR 0002](0002-matcher-learns-from-pm-reviews-in-prompt.md)'s path to scale ("Problem boundary notes, adopted in the first version"). Boundary notes are no longer adopted. The Matcher learns the PM's lines from Matching examples, and Regression cases keep those lines in place.

## The test

The test is build ticket 06 (`npm run eval -- --ablation`, cases in `evals/matcher/ablation/`). We used one fixed state: 12 Problems and 8 simulated PM Match reviews. Every review is a Move or Split that draws a line the titles don't make obvious: roast-data import vs a profile to roast against, export vs a personal copy of a shared recipe, grinder calibration vs remembered settings, grinder retention vs calibration, recipe scaling vs the ratio calculator, backup vs export, roasted vs green stock, and live sync vs export. The reviews are the Matching examples. The real Boundary-note writer distilled the Boundary notes from those same reviews, once, and the result is committed in `boundary-notes.json` (14 writer calls, $0.0429).

We tested 8 boundary cases, each a new Request on one review's line and worded differently from the reviewed Request. We also ran 3 golden cases, in arms (b) and (c), for the regression veto. The three arms were:

- **(a)** neither notes nor examples
- **(b)** Matching examples only
- **(c)** examples plus Boundary notes

Each arm ran twice on claude-sonnet-5-5.

**The rule:** keep Boundary notes only if (c) beats (b) by at least 2 boundary cases on both runs, and no golden case regresses (passes in (b) but fails in (c)) on either run. Otherwise cut them. This is `decideBoundaryNotes` in `evals/harness/ablation.ts`.

## The numbers

Boundary cases answered right, out of 8:

| Run | (a) neither | (b) examples only | (c) examples + notes | (c) − (b) | Golden regressions |
| --- | --- | --- | --- | --- | --- |
| 1 | 8 | 8 | 8 | +0 | none |
| 2 | 7 | 8 | 8 | +0 | none |

| Arm | Cost per Request |
| --- | --- |
| (a) neither | $0.00520 |
| (b) Matching examples only | $0.00830 |
| (c) examples + Boundary notes | $0.01086 |

The ablation run cost $0.5046 for 60 AI calls (cap: 60 calls or $1.00 per run). The full result is in `evals/matcher/ablation/result.json`.

## Decision

**Cut.** The margin of (c) over (b) was +0 on both runs, short of the +2 the rule needs. Notes made each Request about 31% dearer than examples alone ($0.01086 vs $0.00830). They also cost a background writer call per affected Problem on every Move or Split, and they rewrite a PM-facing text that no PM accepted. Following the answer to the wayfinder ticket, nothing unmeasured replaces them. The writer, the Matcher's Boundary-note prompt section, the editor, the background distillation and the `boundary_note` column all go. "Boundary note" leaves the glossary. A guidelines document could return later only by passing the same test.

## What was removed, and how to bring it back

These were removed in the same PR as this ADR:

- the Boundary-note writer (`src/lib/boundary-note-writer.ts`)
- background distillation after each Match review (`distilBoundaryNotes`)
- the PM editor and its server action
- the Boundary-note card on the Problem page
- the Matcher's prompt paragraph and the `Boundary note:` line in its Problem list
- `ProblemSummary.boundaryNote`
- the `problems.boundary_note` column, dropped by migration `0003_drop_boundary_note`, which also drops any notes already stored

The `boundary_note` AI module stays in `AI_MODULES`, so AI call records the writer made still read, but nothing calls it.

Kept as the record of this test, in `evals/matcher/ablation/`:

- the cases and simulated reviews (`cases.ts`)
- the notes the writer produced (`boundary-notes.json`)
- the run (`result.json`)
- the pure scoring and decision code, with its tests (`evals/harness/ablation.ts`)

The ablation runner (`--ablation`, `--ablation-notes`) was removed too, because arm (c) needs the Matcher's notes path.

To re-run the test, take three steps:

1. Restore the Matcher's notes path and the writer from `v2` before this PR (commit `8432599`).
2. Re-add a runner that judges `armCases(arm)` with each arm's Problems (with or without notes) and `ablationMatchingExamples()` (or none) through the metered Matcher.
3. Feed its `ArmRun`s to `decideBoundaryNotes`.

## What this can't tell you

- **The cases hit the ceiling.** Arm (a), with no examples and no notes, already got 8/8 and 7/8. The Problem need statements were clear enough for the Matcher to draw these lines unaided, so neither examples nor notes had room to show a gain. With (b) at 8/8, no result could have met the keep rule. The evidence says notes added nothing *on these cases*. It doesn't show that notes never help. Harder cases (vaguer need statements, more near-duplicate Problems, lines that go against the need statement) could tell a different story. Per the rule, such a test would have to justify bringing notes back, not keeping them.
- Eight boundary cases and two runs make a small sample. Run-to-run noise was one case in (a) and none in (b) or (c).
- The reviews and Requests are simulated, written by the same agent that built the test. Real PM lines may be less legible than these.
- With 8 examples, prompt size isn't a problem. With retrieval at scale (ADR 0002 steps 1–2), examples have to be retrieved by relevance. Notes travelling with candidate Problems was the argument for them at scale, and this ablation doesn't test that.

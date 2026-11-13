# 06: Do Boundary notes earn their place?

Type: grilling
Status: resolved
Blocked by: 03, 04

## Question

What test decides whether Boundary notes stay, and what happens on each result?

- **The ablation:** the golden set with vs without notes, how the notes in the eval are produced (written from the golden set's own reviews, or by hand?), and the minimum improvement that justifies the extra AI call.
- **If they stay:** distillation becomes a visible suggestion. When is it proposed, how does a PM accept or edit it, and how are accepted notes versioned in the trace?
- **If they go:** what replaces them, if anything (a PM-owned matching-guidelines document, relevant examples only), and the migration of existing notes.
- Since the build can't be run while charting, the spec states this as a conditional build step: build the ablation, run it, then follow the branch the result picks.

The vehicle (from the eval harness ticket): fixed-state cases in `evals/matcher/cases.ts` that carry Boundary notes on the Problems shown, run with and without the notes.

From the queue prototype: if they stay, a suggestion could appear as a step in the inbox detail pane after a Move/Split (Accept / Edit / Dismiss), as variant C showed.

## Answer

Resolved 2026-11-18 (grilling). The decision is a **conditional build step**, settled by evidence during the build.

1. **Three arms** over the fixed-state cases: (a) neither notes nor examples; (b) Matching examples only; (c) examples + Boundary notes. (b) vs (c) is the keep test; (a) vs (b) shows whether examples matter.
2. **Cases and fixtures:** 8–10 boundary-sensitive fixed-state cases where the PM's line isn't obvious from the titles (e.g. roast-data import vs profile import, export vs personal copy, grinder retention vs calibration), each with a simulated review. Fixtures: those reviews as Matching examples, and notes generated **once** by the real Boundary-note writer from them, checked by the human and committed. Deterministic, and it tests the real note pipeline.
3. **Keep threshold:** each arm runs twice (about 60 calls, under $1). Notes stay only if (c) beats (b) by **≥2 boundary cases on both runs** with no golden case regressing. The report shows cost per Request for each arm. Otherwise they're cut.
4. **If kept: Suggest-level autonomy.** After a Move or Split, the writer drafts a revision for each affected Problem, shown in the inbox detail pane as a diff (current vs suggested) with Accept / Edit / Dismiss. Nothing changes until a PM accepts. Accepted notes are stored as revisions (who, when, drafting AI call). The glossary entry becomes "…accepted by a PM".
5. **If cut:** remove the writer, the Matcher's Boundary-note prompt section, the editor and the column. No unmeasured replacement: the lesson lives in Matching examples and Regression cases. Drop the 3 existing notes and remove "Boundary note" from the glossary. A guidelines doc could return later only through the same test.
6. **Build order:** an ablation slice right after the eval harness and before the Match review inbox slice. The build agent runs it and posts the numbers; **the human makes the keep-or-cut call**. The inbox slice builds with or without the suggestion step, and the spec writes out both branches.
7. **ADR 0003** records the result and its numbers either way, amending step 3 of ADR 0002's path to scale.

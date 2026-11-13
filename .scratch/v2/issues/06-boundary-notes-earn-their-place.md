# 06: Do Boundary notes earn their place?

Type: grilling
Status: open
Blocked by: 03, 04

## Question

What test decides whether Boundary notes stay, and what happens on each result?

- **The ablation:** the golden set with vs without notes, how the notes in the eval are produced (written from the golden set's own reviews, or by hand?), and the minimum improvement that justifies the extra AI call.
- **If they stay:** distillation becomes a visible suggestion. When is it proposed, how does a PM accept or edit it, and how are accepted notes versioned in the trace?
- **If they go:** what replaces them, if anything (a PM-owned matching-guidelines document, relevant examples only), and the migration of existing notes.
- Since the build can't be run while charting, the spec states this as a conditional build step: build the ablation, run it, then follow the branch the result picks.

The vehicle (from the eval harness ticket): fixed-state cases in `evals/matcher/cases.ts` that carry Boundary notes on the Problems shown, run with and without the notes.

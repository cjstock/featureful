# 05: AI evaluation and Product Strategy

**What to build:** Problems are evaluated by AI automatically. The Evaluator scores Impact, Strategic fit (against the Product Strategy), Effort, and delivery Risk 1–5, each with a one-line reason. Internal stakeholders see the full score breakdown with reasons on the Problem page. A PM can edit the Product Strategy and re-evaluate one Problem or all of them.

**Blocked by:** 02, 03, 04

**Status:** ready-for-agent

- [ ] The Evaluator is one structured-output LLM call taking the Problem, its Evidence, and the Product Strategy
- [ ] Risk means delivery risk (not the risk of inaction), per the glossary
- [ ] Evaluation runs after the response is sent when a Problem is created or gets new Evidence via Intake
- [ ] The Problem page shows a breakdown for each criterion (score, reason, weighted contribution) plus the total and evaluated_at to Internal stakeholders only
- [ ] A PM-only Product Strategy page edits the single strategy text
- [ ] PM-only "Re-evaluate" (one Problem) and "Re-evaluate all" actions exist; Support agents can't trigger them
- [ ] An unevaluated or failed evaluation shows a clear "not evaluated" state rather than crashing

# 02: Match review: Confirm, Move, Split, and learning from examples

**What to build:** From the review queue, a PM can Confirm a Matching decision, Move the Request to another existing Problem (searchable select), or Split it into a new Problem (pre-filled with the Matcher's new-Problem title and need, editable), each with an optional note. Move and Split relocate the Request and the submitter's Support, delete a Problem left with no Evidence, and re-evaluate the affected Problems in the background. The Matcher then receives up to 20 Matching examples, corrections first, so it learns from the reviews.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `review(decisionId, verdict, opts, reviewerId)` on the Match review module runs in one transaction, following the spec's rules (Support moves; Support stays on the source if the submitter has another Request there; the source is deleted if it has no Evidence, its Supports go with it, and the proposed Problem id is nulled; double review and moving a Request onto its own Problem are refused)
- [ ] It returns the affected Problem ids that still exist; the caller re-evaluates them in the background (`after`)
- [ ] Match review tests cover all the spec's Match review cases with a fake BoundaryNoteWriter dependency (the interface can be a no-op until ticket 03)
- [ ] A PM-only `reviewMatch` server action returns the shared Result type
- [ ] Queue items get Confirm, Move, and Split controls with an optional note; reviewed items move to the Reviewed tab and show their verdict and note
- [ ] Intake loads up to 20 Matching examples (corrections first, then most recent) and passes them to the Matcher; the LLM Matcher prompt includes them with PM notes
- [ ] The Intake test asserts the Matcher receives examples ordered and capped correctly
- [ ] The review note stays internal (Customers never see it)
- [ ] Typecheck, vitest, eslint, and next build pass

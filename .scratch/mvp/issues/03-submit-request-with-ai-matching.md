# 03: Submit a Request with AI matching

**What to build:** A Customer or Support agent submits a Request (title + description). Before anything is saved, the AI proposes either attaching it as Evidence to an existing Problem (with confidence and a one-line reason) or creating a new Problem (with an AI-written title and need statement, phrased as the underlying need rather than a solution). The submitter accepts, or rejects with "mine is different", and the Request is saved accordingly with the submitter's Support added. This is the core AI workflow.

**Blocked by:** 01

**Status:** done

- [x] The Intake module exposes `propose` (writes nothing) and `confirm` (writes the Request, creates the Problem if needed, adds Support idempotently)
- [x] Intake depends on a Matcher interface; the production Matcher is one structured-output LLM call with the full Problem list (per ADR 0001), told to match only when the underlying need is the same
- [x] Rejecting a match creates a new Problem, using an AI-proposed title and need statement
- [x] A submitter who already supports the matched Problem gets the Request added as Evidence without a duplicate Support
- [x] The submit UI shows a loading state during the AI call, and an error with retry that keeps the typed input
- [x] After confirming, the user lands on the Problem page
- [x] Vitest tests run against an in-memory SQLite db with a fake Matcher and cover: match accepted, match rejected, no match, Support not duplicated, `propose` writes nothing
- [x] A hook point exists to trigger evaluation after confirm (wired up in 05)

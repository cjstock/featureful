# 01: Matching decision records and the review queue

**What to build:** Every confirmed submission records a Matching decision: what the Matcher proposed and what the submitter chose. The seed records them too. A PM can open a review queue (tabs "To review" with a count, and "Reviewed"), linked from the header with the count, showing each decision's Request, submitter, Matcher proposal (confidence and reason), submitter choice, and current Problem. This ticket is read-only (no review actions yet), and it makes ALL the schema changes for the spec, including Problem boundary_note, in one migration.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] One migration adds the matching_decisions table (per spec, review fields nullable) and a nullable problems.boundary_note column
- [x] Intake `confirm` writes the Matching decision in the same transaction, with the submitter choice derived (accepted / rejected / no-match)
- [x] Intake tests are extended: a decision is recorded correctly for match-accepted, match-rejected, and no-match
- [x] The Match review module exists with `listQueue` (unreviewed, newest first) and `listReviewed`, tested on in-memory SQLite
- [x] A PM-only review queue page; Support agents and Customers can't access it
- [x] A header link for PMs, with the count of unreviewed decisions
- [x] The seed (through Intake) records decisions; verify with `npm run seed -- --dry-run`
- [x] Typecheck, vitest, eslint, and next build pass

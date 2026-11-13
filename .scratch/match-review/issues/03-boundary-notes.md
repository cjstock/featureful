# 03: Boundary notes

**What to build:** After a Move, a Split, or a Confirm with a note, each affected Problem's Boundary note is revised in the background by the AI from the review ("Includes … Does not include …", at most 3 sentences). The Matcher reads each Problem's Boundary note alongside its title and need. Internal stakeholders see the Boundary note on the Problem page, and PMs can edit it directly.

**Blocked by:** 02

**Status:** done

- [x] The production BoundaryNoteWriter is one structured-output call; on failure the existing note is kept
- [x] Distillation runs in the background once per affected, still-existing Problem after Move, Split, or Confirm-with-note; Confirm without a note makes no call
- [x] Intake passes Boundary notes to the Matcher; the LLM Matcher prompt includes them; the Intake test asserts they're passed
- [x] The Problem page shows the Boundary note to Internal stakeholders and hides it from Customers
- [x] A PM-only `updateBoundaryNote` action and inline editor
- [x] The README briefly describes the review queue and how the Matcher learns
- [x] Typecheck, vitest, eslint, and next build pass

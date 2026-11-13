# Spec: Match review and a Matcher that learns

Status: ready-for-agent

## Problem Statement

The Matcher decides, at submission, whether a new Request shares the underlying need of an existing Problem. Sometimes it gets this wrong. For example, a Request about recording cupping sessions became a new Problem even though a PM might consider it the same need as "Evaluating and comparing roast flavour quality". Other times it may lump different needs together.

Today a PM has no way to:
- see what the Matcher decided;
- correct it when it's wrong;
- teach it the product team's view of where one Problem ends and another begins.

As a result, wrong groupings distort Demand and Priority scores, and the same mistakes repeat.

## Solution

Every Request records a **Matching decision**: what the Matcher proposed and what the submitter chose.

PMs work through a **review queue** of unreviewed Matching decisions. For each one, the PM gives a **Match review**, with an optional note:
- **Confirm**: the decision was right.
- **Move**: the Request belongs to a different existing Problem.
- **Split**: the Request needs a new Problem of its own.

Moving or splitting relocates the Request and its submitter's Support. It deletes any Problem left with no Evidence and re-evaluates the affected Problems.

Each reviewed decision becomes a **Matching example**. The Matcher's prompt includes recent Matching examples, corrections first. Reviews are also distilled into a **Boundary note** on each affected Problem. A Boundary note says what the Problem does and does not cover, and the Matcher reads it whenever it considers that Problem. PMs can edit Boundary notes directly.

Over time the Matcher aligns with the PM's judgement. ADR 0002 records this design and its path to scale.

## User Stories

### Recording decisions

1. As a PM, I want every newly submitted Request to record what the Matcher proposed (a match with confidence and reason, or a new Problem) and what the submitter chose, so that I can review it later.
2. As a PM, I want to see when the submitter rejected a suggested match ("mine is different"), so that I can judge whether the submitter or the Matcher was right.
3. As a developer, I want the seed to record Matching decisions for every seeded Request, so that the review queue is populated in the demo.

### Review queue

4. As a PM, I want a review queue of unreviewed Matching decisions, newest first, so that I can work through them.
5. As a PM, I want each queue item to show:
   - the Request's title and description and its submitter;
   - the Matcher's proposal, with its confidence and reason;
   - the submitter's choice;
   - the Problem the Request currently belongs to;

   so that I have everything I need to judge it.
6. As a PM, I want to see how many decisions are waiting for review, so that I know my backlog.
7. As a PM, I want to see reviewed decisions with their verdict and note, so that I can see what the Matcher has been taught.
8. As a PM, I want the queue linked from the header, so that I can find it.
9. As a Support agent or Customer, I want no access to the review queue or review actions, so that matching decisions stay with PMs.

### Match review actions

10. As a PM, I want to Confirm a Matching decision, so that the Matcher learns what a good decision looks like.
11. As a PM, I want to Move a Request to another existing Problem, chosen from a searchable list, so that I can fix a wrong match.
12. As a PM, I want to Split a Request into a new Problem, pre-filled with the Matcher's already-written new-Problem title and need, and editable before saving, so that I can separate a wrongly lumped need.
13. As a PM, I want to add an optional note to any review explaining my reasoning, so that the Matcher learns why.
14. As a PM, I want a reviewed decision to leave the queue, so that I don't review it twice.
15. As a PM, I want Move and Split to be all-or-nothing, so that a failure never leaves a Request half-moved.

### Effects of Move and Split

16. As a PM, I want the submitter's Support to follow their Request to its new Problem, so that Demand reflects who actually needs what.
17. As a PM, I want the submitter's Support removed from the old Problem only when they have no other Request left there, so that their Support isn't wrongly removed.
18. As a PM, I want a Problem left with no Evidence after a Move or Split to be deleted, so that Problems with no Customer behind them don't clutter the list.
19. As a PM, I want both affected Problems re-evaluated in the background after a Move or Split, so that Priority scores stay accurate.
20. As a Customer whose Request was moved, I want to see my Request on its new Problem and have my "Problems I support" list updated, so that I can follow the right Problem.
21. As a Customer, I want the PM's review note kept internal, so that internal reasoning isn't exposed.

### Learning

22. As a PM, I want the Matcher to consider up to 20 recent Matching examples, corrections (Move and Split) first, including my notes, so that it repeats fewer mistakes.
23. As a PM, I want each Match review distilled into the Boundary note of every affected Problem, so that the lesson stays attached to the Problems it concerns.
24. As a PM, I want the Matcher to read each Problem's Boundary note alongside its title and need, so that it respects the boundaries I've drawn.
25. As an Internal stakeholder, I want to see a Problem's Boundary note on its page, so that I understand what it does and does not cover.
26. As a PM, I want to edit a Problem's Boundary note directly, so that I can fix or write it myself.
27. As a PM, I want a failed Boundary note distillation to leave the existing note unchanged and the review still saved, so that an AI failure never loses my review.
28. As a PM, I want Confirm without a note to skip distillation, so that the AI isn't called when there's nothing new to learn.

## Implementation Decisions

**Schema:**
- New **matching_decisions** table, one row per Request, unique on request_id. It stores:
  - what the Matcher proposed: the proposed Problem id (nullable, set to null if that Problem is deleted), confidence, reason, and the proposed new-Problem title and need;
  - what the submitter chose: accepted the match, rejected it, or there was no match;
  - created_at;
  - review fields, all nullable: verdict (confirm, move, or split), reviewer, reviewed_at, note, the Problem the Request came from, and the Problem it went to.

  A Matching example is a matching_decisions row with a verdict, so there is no separate examples table.
- **problems** gains a nullable boundary_note text column.
- Generate a new migration as the conventions describe. Existing Requests have no Matching decision, so they never appear in the queue. Re-running the seed populates the queue.

**Intake:**
- `confirm` also writes the Matching decision, in the same transaction.
- `propose`'s output already carries everything the decision needs. The submitter's choice is derived from what `confirm` is told to do.

**Matcher:**
- Its input grows to include each Problem's Boundary note and up to 20 Matching examples, ordered corrections first and then by most recent review.
- Each example shows:
  - the Request;
  - what the Matcher proposed;
  - the submitter's choice;
  - the PM's verdict, with the source and destination Problem titles;
  - the note.
- The Intake module loads the examples and Boundary notes and passes them to the Matcher interface. The Matcher stays a pure "input to proposal" dependency, so the fake Matcher in tests is unaffected.
- This keeps ADR 0001's compromise of sending everything in the prompt.

**Match review module** (new, deep). It depends on the db and an injected BoundaryNoteWriter. Its operations:
- `listQueue` returns unreviewed decisions, newest first.
- `listReviewed` returns reviewed decisions.
- `review(decisionId, verdict, {note, targetProblemId?, newProblem?: {title, need}}, reviewerId)`:
  - Runs in one transaction.
  - Confirm records the verdict only.
  - Move reassigns the Request to the target Problem.
  - Split creates a Problem from the given title and need and reassigns the Request to it.
  - For Move and Split:
    - add the submitter's Support to the destination idempotently;
    - remove it from the source if the submitter has no other Request there;
    - delete the source Problem if it has no Evidence left, along with its Supports;
    - record the source and destination Problems on the decision.
  - Refuses to review a decision that has already been reviewed, or to move a Request onto the Problem it's already on.
  - Returns the affected Problem ids that still exist, so the caller can re-evaluate them and distil Boundary notes after the response.

**BoundaryNoteWriter** (AI). Interface: given the current Boundary note of a Problem and one Match review (the Request, the verdict, the source and destination Problems, the note), it returns a revised Boundary note of at most 3 sentences, phrased as "Includes … Does not include …".
- Runs in the background after Move, Split, or Confirm with a note, once for each affected Problem that still exists.
- On failure the existing note stays.
- The production version is one structured-output call.

**Server actions:** all PM-only, returning the shared Result type:
- `reviewMatch`;
- `updateBoundaryNote`.

**UI:**
- A PM-only review queue page with two tabs: To review (showing a count) and Reviewed. Each item has the Confirm, Move, and Split controls with an optional note. Move uses a searchable Problem select. Split shows the pre-filled title and need, which the PM can edit.
- A header link for PMs, showing the count.
- The Problem page shows the Boundary note to Internal stakeholders; PMs can edit it.

**Seed:** the seed goes through Intake, so it records Matching decisions without any extra work.

**README:** briefly mention the review queue and that the Matcher learns from reviews.

## Testing Decisions

- Good tests check external behaviour through a module's public interface, using an in-memory SQLite db and fakes for the AI dependencies. They don't test internals.
- **Intake (existing seam, extended):**
  - `confirm` records a Matching decision with the right proposal and submitter choice for match-accepted, match-rejected, and no-match;
  - the Matcher receives the Boundary notes and the Matching examples ordered corrections first, capped at 20.
- **Match review (new seam):** test with a fake BoundaryNoteWriter. Cover:
  - Confirm records the verdict and moves nothing;
  - Move relocates the Request and Support, and keeps the submitter's Support on the source when they have another Request there;
  - Split creates a Problem from the given title and need;
  - a source left without Evidence is deleted, its Supports go with it, and any proposed Problem id pointing to it becomes null;
  - double review and moving a Request onto its own Problem are refused;
  - the returned affected ids exclude deleted Problems;
  - listQueue and listReviewed filter correctly.
- **Not tested automatically:** the real BoundaryNoteWriter, the Matcher prompt wording, and the UI. Check them with one live Move plus a follow-up submission, under the $10 API budget.
- **Prior art:** the existing Intake tests (in-memory db plus fake Matcher).

## Out of Scope

- Embedding or vector retrieval of candidate Problems and examples (ADR 0001 and ADR 0002 path to scale, steps 1–2).
- Distilled global matching guidelines, measuring agreement or regression tests against the labelled set, prioritized or sampled review queues, and fine-tuning (ADR 0002 steps 4–7).
- Free-text global Matching guidance and a minimum-confidence threshold.
- Re-reviewing an already-reviewed decision, and undoing a Move or Split.
- Merging two existing Problems wholesale.
- Matching decisions for Requests created before this feature, beyond what re-running the seed gives.
- Notifying submitters when their Request moves.
- Support agents reviewing matches.

## Further Notes

- Use the GLOSSARY.md terms throughout: Matcher, Matching decision, Match review, Matching example, Boundary note.
- Deleting a Problem also discards its Decision brief, Decision note, and score override. This is accepted, because only Problems with no Evidence are deleted.
- Each Move or Split costs about 4 AI calls: 2 re-evaluations plus up to 2 distillations. Confirm with a note costs 1, and Confirm without a note costs 0.

# 04: Match review as a risk-ranked escalation queue

Type: grilling
Status: resolved
Blocked by: 03

## Question

Which Matching decisions reach a PM, in what order, what can the PM do with them, and what does each verdict produce?

- **Escalation rules:** which signals put a decision in the queue (low confidence, "mine is different", a match into a high-Demand Problem, a new Problem proposed beside a close candidate, a random spot-check sample), and the rate. What happens to decisions that aren't escalated: auto-accepted, and marked as such?
- **Ranking:** how the queue is ordered, and whether each item shows *why* it was escalated.
- **Verdicts:** do Confirm, Move and Split stay? What is Confirm *for* now (agreement data, a positive example)? Does a note stay optional?
- **Outputs:** each verdict's effect on Matching examples, on regression cases (per 03), and on PM agreement rate. Should the Matcher get relevant examples rather than "the most recent 20"?
- **Glossary:** a re-scoped Match review, plus any new terms (escalation, regression case).
- **Requests that bypassed the Matcher** (Matcher off or out of budget) must enter the queue for grouping (handed on from the trace/budget ticket).
- **Promoting a reviewed decision to a regression case** (handed on from the eval harness ticket): the PM action, and a case built from the AI call's snapshot of the Problems shown, in `evals/matcher/cases.ts` format (`kind: regression`, `source: Matching decision #id`).

## Answer

Resolved 2026-11-18 (grilling).

1. **The card asks one question:** "Does this Request share the need of this Problem?" It shows the new Request side by side with the Problem's need and 2–3 excerpts of its existing Evidence, plus the Matcher's reason and confidence, the submitter's choice, and the Escalation reasons as chips. The unit stays the Matching decision.
2. **Escalation reasons**, computed deterministically at confirm time and stored on the decision; thresholds live in config:
   - **Bypassed:** the Matcher was off, out of budget or failed.
   - **Mine is different:** the submitter rejected the match.
   - **High-Demand merge:** matched into a Problem with ≥5 supporters.
   - **Low confidence:** a match below 0.75.
   - **Near miss:** a new Problem was proposed with a runner-up at ≥0.4. This needs a new `closestProblem` (id + confidence) field in the Matcher output, a prompt change measured by the eval.
   - **Spot check:** a random 10% of everything else.
3. **Not escalated = Auto-accepted:** it never sits in the queue. A "Not escalated" tab lists these, and any of them stays reviewable. A migration backfills reasons for existing unreviewed decisions.
4. **Ranking:** by the strongest reason (bypassed > mine is different > high-Demand merge > low confidence > near miss > spot check), then oldest first.
5. **Verdicts:** Confirm, Move and Split stay. The buttons read "Same need ✓", "Belongs on another Problem" and "Needs its own Problem". **Move and Split require a note** ("What makes these different needs?"); Confirm's note is optional.
6. **Confirm's purpose:** every verdict is a PM-agreement data point. A Confirm becomes a Matching example only when the escalation was for an ambiguity reason (mine is different, low confidence, near miss).
7. **Regression cases:** Move and Split have an "Add as regression case" checkbox, ticked by default. The AI call stores the Problems shown as structured data. `npm run eval:pull` exports the marked decisions into `evals/matcher/regression.json` (format `kind: regression`, `source: Matching decision #id`), which a human commits in a Yellow-lane PR. The app never writes source files.
8. **Matching examples:** still corrections first, then the 20 most recent, but only from informative reviews (point 6). Choosing examples by relevance stays on ADR 0002's path to scale (out of scope).
9. **Bypassed Requests:** the card asks "Group this Request". The PM picks an existing Problem (Move) or keeps it as its own Problem (Confirm).
10. **Glossary:** added Escalation, Escalation reason, Auto-accepted and Regression case; Match review re-scoped.

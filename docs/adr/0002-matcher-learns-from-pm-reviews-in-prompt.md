# The Matcher learns from PM Match reviews via in-prompt Matching examples

PMs review Matching decisions (Confirm, Move, Split, with an optional note). Each review becomes a Matching example, and the Matcher's prompt includes the 20 most recent examples, corrections first. We chose this over fine-tuning, a trained classifier, or embedding retrieval because it needs no extra infrastructure, takes effect on the next submission, and keeps the PM's notes legible to the model. It shares ADR 0001's scale compromise: "most recent 20" forgets older lessons and ignores relevance.

## Path to scale

Replace "send everything" (ADR 0001) and "most recent N" (this ADR) with retrieval scoped to the Request at hand:

1. **Candidate retrieval**: embed Requests and Problem statements; for a new Request, retrieve the top-k candidate Problems (hybrid vector + keyword). The LLM judges only those candidates.
2. **Example retrieval**: include Matching examples that are nearest to the new Request, or that involve the candidate Problems (Requests moved into or out of them), instead of the most recent ones.
3. **Problem boundary notes** (adopted in the first version, before retrieval exists): distill reviews into short notes on each Problem ("includes X; not the same as Problem Y"). They travel with the Problem whenever it is a candidate, so prompt size grows with k, not with history.
4. **Distilled guidelines**: periodically have the LLM summarize PM notes into a versioned, PM-editable matching-guidelines document, so recurring lessons don't depend on example retrieval.
5. **Measure alignment**: reviewed examples form a labelled eval set. Track the PM agreement rate over time and replay the set offline before changing the prompt or model.
6. **Review at scale**: don't review everything. Prioritize low-confidence decisions and high-Demand Problems, and spot-check a sample of high-confidence ones.
7. **Eventually**: with thousands of labelled pairs, train a reranker or fine-tune, keeping the LLM for reasons and new-Problem statements.

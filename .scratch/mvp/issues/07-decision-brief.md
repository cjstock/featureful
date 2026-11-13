# 07: Decision brief

**What to build:** A PM generates a Decision brief for a Problem. It covers the problem statement, a summary of the Evidence with 2–3 representative quotes, the score breakdown, a do/defer/decline recommendation with reasoning, and open questions. The brief is saved on the Problem, shown to Internal stakeholders, and can be regenerated.

**Blocked by:** 05

**Status:** done

- [x] The Brief writer is one LLM call taking the Problem, its Evidence, and its score breakdown, and returning markdown
- [x] The brief and its generated-at time are stored; viewing never regenerates it
- [x] PM-only generate/regenerate action with a loading state
- [x] The brief is rendered on the Problem page for Internal stakeholders; hidden from Customers

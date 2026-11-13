# Match Requests to Problems by sending the full Problem list to the LLM

When a Request is submitted we send every existing Problem's title and underlying need to the LLM in one prompt and ask it to pick a match or propose a new Problem. We chose this over embeddings + vector search because it needs no extra provider or vector store and fits the ~3 hour MVP budget.

## Consequences

This is a deliberate scale compromise: prompt size and cost grow linearly with Problem count, and it degrades past a few hundred Problems. To scale, rework matching into a retrieval step (embeddings, top-k candidates) followed by the LLM judging only the candidates.

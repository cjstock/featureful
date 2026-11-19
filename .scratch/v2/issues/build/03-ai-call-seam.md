# 03: One AI call seam with full AI call records

**What to build:**
- **The seam:** every AI call goes through `aiGenerate` in `src/lib/ai.ts`, and ESLint bans importing `ai` anywhere else.
- **The record:** each attempt writes an AI call row with prompt version, tokens, cost, latency, outcome, full content, and the structured Problems shown.
- **On the decision:** Matching decisions store the prompt version and the AI call id.
- **In the UI:** a PM sees an AI call line on each Matching decision card and each Problem evaluation.

Detail: [trace ticket](../02-trace-budget-off-switch.md).

**Lane:** 🔴 Red (migration, AI call writes)

**Blocked by:** 02

**Status:** done ([#4](https://github.com/cjstock/featureful/pull/4))

- [ ] `aiGenerate({ module, related, person, source, system, prompt, schema, maxOutputTokens })` sets `maxRetries: 0` and catches `NoObjectGeneratedError` as `parse_failed`. It records one row per attempt and rethrows failures to the caller unchanged.
- [ ] ESLint `no-restricted-imports` blocks `ai` and `@ai-sdk/*` outside `src/lib/ai.ts`.
- [ ] Migration adds `ai_calls` with these columns: time, module, model, prompt_version, input_no_cache, cache_read, cache_write, output_tokens, cost_usd, latency_ms, outcome, error, related_type, related_id, person_id, source, prompt, output, shown_problems (JSON). `matching_decisions` gains `prompt_version` and `ai_call_id`.
- [ ] Config holds the price table and the per-module output caps (Matcher 1,000; Evaluator 1,500; Boundary note 400; Decision note 800; Brief 2,500).
- [ ] All five modules (Matcher, Evaluator, Boundary note writer, Brief writer, Decision note drafter) use `aiGenerate`. Their behaviour is otherwise unchanged.
- [ ] The eval runner and the seed go through `aiGenerate` with `source: eval` / `seed`, and the eval's per-run cap now uses it.
- [ ] UI: "Matcher · v3f9a · $0.004 · 1.2s · view prompt" on decision cards and Problem evaluations. "view prompt" opens the stored prompt and output, PM-only.
- [ ] Tests cover `aiGenerate` with a mock model: an ok row, an error row, a parse_failed row, and the cost maths.
- [ ] The eval shows **no regression** against the v1 baseline. Prompts are unchanged; only the plumbing is new.

# 02: AI call trace, budget guard and off switch

Type: grilling
Status: resolved
Blocked by: 01

## Question

What exactly does v2 record, enforce and let a PM switch off at the AI-call seam?

- **Trace record:** its fields (module, model, prompt version, tokens, cost, latency, outcome, related id), what "prompt version" means (a hash of the system prompt? also the examples or notes shown?), and where it shows up for a PM ("why did Request X match Problem Y?").
- **Budget guard:** the limits (daily $ cap, per-person submit rate), where they're configured, what counts against them (are eval runs counted separately?), and exactly what a submitter or PM sees on a hard stop. Their stance: "budgets enforced at the gateway with a hard stop."
- **Off switch:** per module, PM-owned, and where it lives. What does each module do when it's off (Matcher: every Request becomes a new Problem; Evaluator: no scores)? Who is the named owner?
- **Seam placement:** one wrapper or middleware for all five modules (see 01), and how tests fake it.
- **Surfaced by the AI-call seam research:** retries (each attempt is a separate billed call, so are they traced and counted separately? keep `maxRetries`?), the 128,000 `max_tokens` default (set `maxOutputTokens` per module so a pre-call worst-case cost is bounded?), and `Output.object` parse failures, which happen after the middleware (how is that outcome traced?).

## Answer

Resolved 2026-11-18 (grilling).

1. **Seam:** one helper in `src/lib/ai.ts` (e.g. `aiGenerate({ module, related, system, prompt, schema, maxOutputTokens })`), not middleware, so parse failures are traced too. All five modules call it. An ESLint `no-restricted-imports` rule bans importing `ai` anywhere else. Module tests keep their fakes; the helper is tested with a mock model.
2. **AI call row**, one per attempt: time, module, model, prompt version; input tokens (no-cache, cache read, cache write) and output tokens; cost in USD from a price table in config (sonnet-5-5 $2/$10, haiku-5-5 $0.10/$0.50 per MTok); latency; outcome `ok | error | parse_failed | refused_budget | refused_off`; error message; related (`request|problem|decision`, id); the person who triggered it; source `app | seed | eval`.
3. **Prompt version** = a short hash of the module's system prompt. The row also stores the full rendered prompt and the output, for reproduction. Matching decisions store the prompt version and the AI call id. Content is PM-only.
4. **Retries:** `maxRetries: 0` everywhere; a failure is visible with a retry button. One click is one billed call.
5. **Output caps** per module in config (Matcher 1,000; Evaluator 1,500; Boundary note 400; Decision note 800; Brief 2,500). Pre-call worst case = (prompt chars ÷ 4 × input price) + (cap × output price); the call is refused if that would cross the remaining daily budget. No `count_tokens`.
6. **Limits:** $2/day for the app (env var, resets 00:00 UTC), counting only `app` AI calls; 10 Request submissions per person per hour. Seed and eval keep their own per-run caps.
7. **Out of budget = degrade, like the off switch:** a Request becomes a new Problem and goes into the PM queue; the Problem shows "not evaluated" with the reason; a PM banner on `/review` says "AI budget reached at HH:MM UTC; resets 00:00 UTC". The per-person rate limit **blocks** the submission ("try again at HH:MM").
8. **Off switch:** a PM-only toggle per module in an "AI controls" section on `/strategy`, stored in the DB, with every flip recorded (who and when). Owner: the PM role. Off means: Matcher → each Request becomes a new Problem, queued as "Matcher off"; Evaluator → "Not evaluated (Evaluator off)"; Brief, Decision note and Boundary note writers → their buttons are disabled with the reason, and the PM writes by hand.
9. **Visibility:** a line on each Matching decision card and each Problem evaluation ("Matcher · v3f9a · $0.004 · 1.2s · view prompt"). No AI-call log page; aggregates belong to the `/review` metrics ticket.
10. **Glossary:** **AI call** added.

**Handed on:** Requests that bypassed the Matcher (off or out of budget) enter the escalation queue, so the escalation ticket must include them. Today's spend and refusal counts are candidate metrics for `/review`.

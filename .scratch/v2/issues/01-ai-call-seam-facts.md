# 01: Facts for one AI-call seam: SDK hooks, pricing, CI mechanics

Type: research
Status: resolved
Blocked by: none

## Question

What do the installed tools give us for tracing, metering and gating every AI call at **one** seam, instead of editing five modules?

1. **AI SDK (`ai` ^7.0.171, `@ai-sdk/anthropic` ^4.0.103):** Does `wrapLanguageModel` middleware (or an equivalent) see every `generateText` + `Output.object` call? What does it expose: input/output tokens (including cache tokens), latency, finish reason, errors, the system prompt (so it can be hashed for a prompt version)? Can middleware **refuse** a call before it is sent, for a budget hard stop, and what error reaches the caller? Can a per-call tag (module name, related id) pass through, e.g. `providerOptions` or telemetry metadata?
2. **Pricing:** current per-token prices for `claude-sonnet-5-5` (the configured model) and `claude-haiku-5-5`, including cache read/write, from Anthropic's primary pricing source. Is there a token-count endpoint that's useful for a pre-call budget estimate?
3. **GitHub Actions:** how to run a job only when given paths change (`paths` filter vs `dorny/paths-filter`), how a required status check behaves when a path-filtered job is skipped, and how secrets behave on PRs from forks. Is `npm ci` + `better-sqlite3` (or whichever SQLite driver `package.json` uses) fine on `ubuntu-latest`?

Cite primary sources (SDK source/docs at the installed version, Anthropic docs, GitHub docs). Record facts, not recommendations.

## Answer

Resolved 2026-11-18 (research subagent). Full findings: `docs/research/ai-call-seam.md` on bookmark `research/ai-call-seam` (commit 36d1e961, pushed; never merged).

1. **One seam works.** All five call sites import the single `model` from `src/lib/ai.ts`; `wrapLanguageModel` middleware sees every call (once per **attempt**: the default `maxRetries: 2` means up to 3 calls). It exposes the system prompt (`params.prompt` system entries), usage (`inputTokens{total,noCache,cacheRead,cacheWrite}`, `outputTokens{total,text,reasoning}`), finish reason and thrown errors; latency must be timed in the middleware. Throwing before `doGenerate` makes no HTTP request, and a non-retryable error reaches the caller as the same instance. Telemetry callbacks can't gate a call. Per-call tags pass through `providerOptions: { featureful: {...} }` (Anthropic ignores foreign namespaces). An `Output.object` parse failure happens *after* the middleware, so it isn't visible there. No call site sets `maxOutputTokens`, so `max_tokens` defaults to 128,000.
2. **Pricing ($/MTok):** sonnet-5-5 $2 in / $10 out, cache read $0.10, 5m write $2.50; haiku-5-5 (≤100K prompt) $0.10 in / $0.50 out. `count_tokens` is free but returns input tokens only, and the installed SDK doesn't wrap it.
3. **GitHub Actions:** a workflow-level `paths` filter that skips leaves required checks **Pending (blocking)**; a job skipped via `if:` counts as **Success**. So: always run the workflow, and gate the eval job with `dorny/paths-filter` + `if:`. Fork PRs get no secrets. `npm ci` with better-sqlite3 13 uses a prebuilt binary on ubuntu-latest (glibc 2.39 ≥ 2.34).

**Not verified:** the middleware error path and `providerOptions` pass-through (read from source, not run); whether structured output adds hidden prompt tokens.

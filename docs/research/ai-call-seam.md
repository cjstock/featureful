# AI call seam: SDK hooks, pricing, CI mechanics

Research for `.scratch/v2/issues/01-ai-call-seam-facts.md`. Gathered 2026-11-18.
Facts only, no recommendations. Each claim cites the source it came from.

Installed versions (read from `node_modules/*/package.json`):

| Package | Version |
|---|---|
| `ai` | 7.0.171 |
| `@ai-sdk/anthropic` | 4.0.103 |
| `@ai-sdk/provider` | 4.0.38 |
| `better-sqlite3` | 13.1.1 |
| local `npm` (Node v26.3.0) | 11.16.0 |

Source-code citations below are paths inside `node_modules/` at those versions. Line
numbers are from the built `dist/` files and can shift between patch releases.

---

## 1. AI SDK: one seam for every call

### 1.1 Does one wrapper see all five call sites?

- All five call sites (`src/lib/intake/llm-matcher.ts`, `src/lib/evaluator.ts`,
  `src/lib/boundary-note-writer.ts`, `src/lib/brief-writer.ts`, `src/lib/decision-note.ts`)
  import the single `model` export from `src/lib/ai.ts` (`anthropic(CLAUDE_MODEL)`,
  where `CLAUDE_MODEL = "claude-sonnet-5-5"` in `src/lib/config.ts`). Every one calls
  `generateText({ model, system: SYSTEM, ..., output: Output.object({ schema }) })`.
  No other file in `src/` or `scripts/` imports from `ai` or `@ai-sdk/*`.
- `wrapLanguageModel({ model, middleware, modelId?, providerId? })` returns a
  `LanguageModelV4`, so it drops in where `model` is used now
  (`ai/dist/index.d.ts` ~L10452; `ai/dist/index.js` ~L17252).
  `middleware` can be a single middleware or an array. The first array entry
  transforms the input first, and the last entry sits right around the model.
- `generateText` calls `stepModel.doGenerate(...)` for each step (`ai/dist/index.js`
  ~L5910–5932). The wrapped model's `doGenerate` runs `transformParams`, then
  `wrapGenerate({ doGenerate, doStream, params, model })` (`ai/dist/index.js`
  ~L17263–17300). So the middleware sees every `generateText` model call.
- **Steps:** `stopWhen` defaults to `isStepCount(1)` (`generateTextInternal`
  signature, ~L5572). None of the five call sites passes tools, so each `generateText` is
  one step, which is one `doGenerate` per attempt.
- **Retries:** `retry(async () => ... stepModel.doGenerate(...))` wraps the model
  call (~L5910). So **`wrapGenerate` runs once per attempt**, not once per
  `generateText`. The default is `maxRetries = 2`, so up to 3 attempts
  (`prepareRetries`, ~L2450). It retries only `APICallError` / `GatewayError` with
  `isRetryable === true` (`retryWithExponentialBackoffRespectingRetryHeaders`, ~L2429–2434).
- **`Output.object`:** the output spec's `responseFormat` (`{type:'json', schema, ...}`)
  is passed to `doGenerate`, so the middleware sees it as `params.responseFormat`
  (~L5918, ~L3619). Parsing and validating the object happen **after**
  `doGenerate` returns (`parseCompleteOutput`, ~L6284). A schema/parse failure throws
  `NoObjectGeneratedError` (~L3627–3698) outside the middleware. The middleware sees a
  successful model call with its usage and finish reason, and the caller gets the parse error.
- For `claude-sonnet-5-5` and `claude-haiku-5-5`, the Anthropic provider's capability table marks
  native structured output as supported (`currentClaude.nativeStructuredOutput: true`,
  `@ai-sdk/anthropic/dist/index.js` ~L181–232). A JSON `responseFormat` with a schema is
  therefore sent as `output_config.format`, not as a forced JSON tool
  (~L4395–4412, ~L4585–4592).

### 1.2 What the middleware can read

`params` is `LanguageModelV4CallOptions` (`@ai-sdk/provider/dist/index.d.ts` ~L1479):
`prompt`, `maxOutputTokens`, `responseFormat`, `tools`, `toolChoice`, `headers`,
`reasoning`, `abortSignal`, `providerOptions`, plus sampling fields.

- **System prompt (for hashing):** `params.prompt` is `LanguageModelV4Message[]`. The
  system text shows up as `{ role: 'system', content: string }` entries
  (`@ai-sdk/provider/dist/index.d.ts` ~L1125). The `system` option is a deprecated alias of
  `instructions` (`standardizePrompt({ system, instructions = system, ... })`,
  `ai/dist/index.js` ~L2250; `@deprecated Use 'instructions' instead`,
  `ai/dist/index.d.ts` ~L869). `convertToLanguageModelPrompt` puts it first as role
  `system` (~L1506–1515). The JSON schema is also available, as `params.responseFormat.schema`.
- **Result** (`LanguageModelV4GenerateResult`, `@ai-sdk/provider/dist/index.d.ts` ~L747):
  `content`, `finishReason`, `usage`, `providerMetadata`, `request`, `response`, `warnings`.
- **Finish reason:** `{ unified: 'stop'|'length'|'content-filter'|'tool-calls'|'error'|'interrupted'|'other', raw: string|undefined }`
  (~L654–673).
- **Usage** (`LanguageModelV4Usage`, ~L695):
  `inputTokens: { total, noCache, cacheRead, cacheWrite }`,
  `outputTokens: { total, text, reasoning }`, `raw`.
  The Anthropic provider maps these as follows (`convertAnthropicUsage`, `@ai-sdk/anthropic/dist/index.js` ~L2382–2422):
  - `noCache = input_tokens`
  - `cacheRead = cache_read_input_tokens`
  - `cacheWrite = cache_creation_input_tokens`
  - `total = input + cacheCreation + cacheRead`
  - `outputTokens.reasoning = output_tokens_details.thinking_tokens`
  - `raw` = the Anthropic usage object

  `cacheWrite` is a single number. The 5m/1h split is only in `raw`, when Anthropic
  sends it.
- **Latency:** the middleware itself does not get a timing field. It can time the
  `await doGenerate()` call. Separately, `generateText` measures `responseTimeMs`
  around the retried call and passes it to `onLanguageModelCallEnd`
  (`performance.responseTimeMs`, `ai/dist/index.js` ~L5907, ~L5946–5975;
  `ai/dist/index.d.ts` ~L1748–1770).
- **Errors:** provider errors are thrown from `doGenerate()` inside `wrapGenerate`, so
  the middleware can catch and rethrow them, once per attempt.

### 1.3 Can middleware refuse a call before it is sent?

- If `transformParams` or `wrapGenerate` throws without calling `doGenerate()`,
  no HTTP request is made, because the provider call only happens inside `doGenerate`
  (`doWrap$2`, `ai/dist/index.js` ~L17275–17288).
- **What reaches the caller:** the thrown error goes through `retry`. In
  `retryWithExponentialBackoffInternal`
  (`@ai-sdk/provider-utils/dist/index.js` ~L3792–3822), a non-retryable error on the
  first try is re-thrown unchanged (`if (tryNumber === 1) throw error`). Retryable means
  an `APICallError`/`GatewayError` with `isRetryable: true`. `generateTextInternal`'s
  catch then runs `wrapGatewayError(error)`, which returns any
  non-`GatewayAuthenticationError` unchanged (`ai/dist/index.js` ~L2270–2271, ~L6296–6310),
  and re-throws it. **So the caller's `await generateText(...)` rejects with the same
  error instance the middleware threw.** `onStepError` and telemetry `onError` are
  notified first.
- If the middleware throws an `APICallError` with `isRetryable: true`, it would be
  retried (up to `maxRetries`) and then wrapped in `RetryError` (`AI_RetryError`, ~L536).
  The retry source above shows this; it was not run.
- Telemetry and lifecycle callbacks **cannot** refuse a call. `notify()` swallows callback
  exceptions (`try { await callback?.(event) } catch {}`, `ai/dist/index.js` ~L2397–2403).
- The SDK's own middleware docs present guardrails as a middleware use case
  (`ai/docs/03-ai-sdk-core/40-middleware.mdx`, "Guardrails" section, ~L476).

### 1.4 Per-call tags (module name, related id)

- `providerOptions` passed to `generateText` reach the middleware as
  `params.providerOptions` (`stepProviderOptions` is passed to `doGenerate`,
  `ai/dist/index.js` ~L5862, ~L5919). The type is `Record<string, JSONObject>`
  (`@ai-sdk/provider/dist/index.d.ts` ~L149).
- The Anthropic provider only parses its own namespaces (`anthropic`, plus a custom provider
  name if configured). `parseProviderOptions` returns early when
  `providerOptions[provider] == null` (`@ai-sdk/provider-utils/dist/index.js` ~L3358–3359;
  `@ai-sdk/anthropic/dist/index.js` ~L4336–4345). In the code read, it neither sends
  nor validates a custom key such as `providerOptions.featureful = { module, relatedId }`.
- The bundled docs show exactly this pattern under "Configuring Per Request Custom Metadata"
  (`ai/docs/03-ai-sdk-core/40-middleware.mdx` ~L578–610). Note: that example reads
  `params?.providerMetadata?.yourLogMiddleware`, but the `params` type field is
  `providerOptions`. `providerMetadata` is not a field of `LanguageModelV4CallOptions`.
- Other per-call channels:
  - `params.headers` reaches the middleware, but it is also sent as HTTP headers to Anthropic.
  - `telemetry.functionId` and `runtimeContext` exist on `generateText`
    (`TelemetryOptions`, `ai/dist/index.d.ts` ~L1121–1170), but they go only to
    lifecycle/telemetry events, **not** to `doGenerate` params, so the middleware cannot see them.
  - `registerTelemetry(...integrations)` registers integrations globally (~L11062). Their
    `onLanguageModelCallEnd` event carries `usage`, `finishReason`, `providerMetadata`,
    `performance.responseTimeMs` (~L1748–1770).

### 1.5 Related facts for a budget estimate

- None of the five call sites sets `maxOutputTokens` (grep of `src/lib`). When it is unset,
  the Anthropic provider sends `max_tokens = maxOutputTokensForModel`
  (`const maxTokens = maxOutputTokens ?? maxOutputTokensForModel`,
  `@ai-sdk/anthropic/dist/index.js` ~L4571–4574). That is 128,000 for these models (`currentClaude.maxOutputTokens: 128e3`, ~L182).
- The installed `@ai-sdk/anthropic` has no token-counting call: no `count_tokens` or
  `countTokens` in `dist/index.js`. See §2.2 for the API endpoint.

---

## 2. Pricing (Anthropic first-party API)

Source: https://platform.claude.com/docs/en/about-claude/pricing (fetched 2026-11-18). USD per million tokens (MTok).

| Model | Base input | 5m cache write | 1h cache write | Cache hit / refresh | Output |
|---|---|---|---|---|---|
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | $2 | $2.50 | $4 | $0.10 | $10 |
| Claude Haiku 5.5, prompt ≤ 100,000 tokens | $0.10 | $0.125 | $0.20 | $0.01 | $0.50 |
| Claude Haiku 5.5, prompt > 100,000 tokens | $0.50 | $0.625 | $1 | $0.05 | $2.50 |

Notes from the same page:

- "Cache hits and refreshes on Claude Opus 5.5 and Claude Sonnet 5.5 are priced at 0.05x the
  base input price." Most other models use 0.1x. Cache writes cost 1.25x (5m) and 2x (1h) of base input.
- Haiku 5.5 long-context rule: "A request's prompt length counts all of its input tokens,
  including cache reads and cache writes. Each request is priced on its own." Claude 4.6+
  models other than Haiku 5.5 bill the full 1M context at standard price.
- Batch API: 50% off input and output. Sonnet 5.5 is $1 / $5. Haiku 5.5 is $0.05 / $0.25 (≤100K)
  and $0.25 / $1.25 (>100K). This can be combined with caching multipliers.
- `inference_geo` US-only adds a 1.1x multiplier on all token categories for 4.6+ models.
- Tool-use system prompt overhead for Sonnet 5.5 and Haiku 5.5 is 286 tokens. Per §1.1, the
  structured-output path here uses `output_config.format`, not tools. This repo does not
  show whether any such overhead applies to `output_config.format`.

### 2.2 Token counting endpoint

Source: https://platform.claude.com/docs/en/build-with-claude/token-counting

- `POST /v1/messages/count_tokens`. "Accepts the same structured list of inputs for creating a
  message, including support for system prompts, tools, images, and PDFs." It returns
  `{ "input_tokens": N }`, so input tokens only and no output estimate.
- `claude-sonnet-5-5` and `claude-haiku-5-5` are in the supported models list.
- "The token count is an **estimate**. In some cases, the actual number of input tokens used
  when creating a message might differ by a small amount."
- "Token counting is **free to use** but subject to requests per minute rate limits": Start
  5,000 RPM / Build 10,000 / Scale 20,000. Its limits are separate from message creation.
- It does not use caching: "token counting provides an estimate without using caching logic", so the
  count cannot say how much of the prompt would be a cache read.
- It returns `invalid_request_error` for server tools (except advisor), the MCP connector, and
  `url`/`file` image or document sources.
- It is a separate HTTP call, so a pre-call estimate adds one round trip per AI call. The installed
  AI SDK provider does not wrap it (§1.5). It would be reached via `@anthropic-ai/sdk`
  (`client.messages.countTokens`), which is not a dependency in `package.json`, or via raw `fetch`.

---

## 3. GitHub Actions

### 3.1 Workflow-level `paths` filter

Source: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
(`on.<push|pull_request|pull_request_target>.<paths|paths-ignore>`)

- "If at least one path matches a pattern in the `paths` filter, the workflow runs."
- `paths-ignore`: "When all the path names match patterns in `paths-ignore`, the workflow will not run."
- Globs use `*` and `**`. "If you define a path with the `!` character, you must also define at
  least one path without the `!` character." Pattern order matters.
- "If there are no files changed, the workflow will not run."
- "If a push contains more than 1,000 commits" the workflow will always run. "If the generated
  diff contains more than 3,000 files and the files the workflow filter matches are not in
  the first 3,000", it will not run.
- When a workflow is skipped by a path filter, "checks associated with that workflow will remain in a
  'Pending' state. A pull request that requires those checks to be successful will be
  blocked from merging."
- The filter applies to the whole workflow, not to single jobs.

### 3.2 `dorny/paths-filter`

Source: https://github.com/dorny/paths-filter (README, fetched 2026-11-18)

- README examples use `dorny/paths-filter@v4`. The README says v4 is a breaking major release for Node 24.
- It enables "conditional execution of workflow steps and jobs". The README notes that the built-in
  path filters "don't work on a level of individual jobs or steps".
- Outputs:
  - `<filter>`: `'true'`/`'false'`
  - `<filter>_count`
  - `<filter>_files` (with `list-files`; the README says to treat these as untrusted)
  - `changes`: JSON array of matched filter names
- Jobs gate on these with `needs: changes` + `if: needs.changes.outputs.<filter> == 'true'`.
- On `pull_request` it uses the GitHub REST API (needs `pull-requests: read`). On push
  and other events it uses git, so the repository must be checked out. `base` is ignored
  for `pull_request` unless `token` is empty.
- The README says nothing about required status checks.

### 3.3 Required status checks vs skipped work

Sources:
https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks ,
https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions

- Skipped by path, branch, or commit-message filtering: "Associated checks stay in a 'Pending'
  state and block merging." The docs' fix: "Avoid requiring workflows that can be skipped."
  Their example: a required `build` whose workflow `paths` don't match shows "Waiting for status
  to be reported."
- Skipped by a job `if:` conditional: "A job that is skipped will report its status as
  'Success'. It will not prevent a pull request from merging, even if it is a required check."
- "Successful check statuses are `success`, `skipped`, and `neutral`."
- A job skipped because a job it `needs` failed "is skipped and may not block merging". The docs' fix:
  "Use `always()` with `needs` for required checks that depend on other jobs."
- "A required status check must have completed successfully in the chosen repository during
  the past seven days."
- "If a check and a commit status have the same name, both must pass when that name is required."

### 3.4 Secrets on PRs from forks

Source: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

- For `pull_request` from a fork: "secrets are not passed to the runner when a workflow is
  triggered from a forked repository" (`GITHUB_TOKEN` excepted). "The `GITHUB_TOKEN` has
  read-only permissions in pull requests from forked repositories."
- First-time contributors to a public repo: "a maintainer with write access may need to approve
  running workflows on the pull request."
- "Workflows triggered by Dependabot pull requests are treated as though they are from a forked
  repository."
- `pull_request_target` "runs in the context of the default branch of the base repository".
  The docs warn: "Running untrusted code on the `pull_request_target` trigger may lead to security
  vulnerabilities" (cache poisoning, write privileges, secrets). They also say: "Avoid using this event if you need
  to build or run code from the pull request."

### 3.5 `npm ci` + the SQLite driver on `ubuntu-latest`

- The SQLite driver is **`better-sqlite3` ^13.1.1** (13.1.1 installed). `@types/better-sqlite3` is ^9.6.0. `engines.node` is `>=22`
  in both `package.json` and `better-sqlite3`'s package.json.
- `better-sqlite3@13.1.1` **ships prebuilt binaries inside the npm tarball**:
  - `prebuilds/{linux,linuxmusl,darwin,win32}-{x64,arm64}.node`, with `"files"` including `prebuilds/**`
  - It is built on Node-API (`node-addon-api`, `NAPI_VERSION=10` in `binding.gyp`), so one binary covers all Node versions.
  - `lib/binding.js` loads `prebuilds/<platform>-<arch>.node` first, and falls back to `build/Release` only if no prebuild matches.
  - `binding.gyp` compiles nothing when a prebuild exists (`'prebuild_exists%': '<!(node lib/binding.js)'`).

  (All read from `node_modules/better-sqlite3/`.)
- `package-lock.json` marks it `"hasInstallScript": true`. The local `node_modules/better-sqlite3/build/`
  has gyp `Makefile`/`config.gypi` but no compiled `.node`. That is consistent with npm running
  `node-gyp` and it building nothing. Even this no-op `node-gyp` configure step runs `node`
  and gyp, and gyp needs Python. That Python is present on the runner image is
  **not verified here** (see Unverified).
- `prebuilds/linux-x64.node` needs glibc symbols up to `GLIBC_2.34` (`objdump -T`).
- `ubuntu-latest` is Ubuntu 24.04 (https://github.com/actions/runner-images README table), and
  Ubuntu noble ships libc6 2.39 (https://packages.ubuntu.com/noble/libc6).
- The repo's `package.json` has an `allowScripts` field (`"better-sqlite3@13.1.1": true`, esbuild versions).
  In npm 11.16.0 (`npm/docs/content/commands/npm-approve-scripts.md`, `using-npm/config.md`):
  - "In the current release, this field is advisory: install scripts still run by default, but
    installs print a list of packages whose scripts have not been reviewed."
  - `strict-allow-scripts` (default false) turns uncovered scripts into a hard error.
  - Passing `--allow-scripts` on the command line to a project `npm ci` is an error.
- `actions/setup-node` README examples use `@v7` with `cache: 'npm'`. The README does not say
  which npm version it installs.
- No `.github/workflows/` directory exists in the repo yet.

---

## Unverified / gaps

- **Not executed:** the middleware-throw → caller error path (§1.3) and the
  custom-`providerOptions` pass-through (§1.4) come from reading source. No test
  was run against a live or mocked model.
- Whether Anthropic sends a 5m/1h breakdown of cache writes in `usage` for these models
  was not checked against a live response. The SDK only exposes it via `usage.raw`.
- Whether `output_config.format` (structured output) adds hidden system-prompt tokens,
  as tool use does (286 tokens), was not found on the pricing page.
- Which npm version `actions/setup-node` gives for Node 22/24 on `ubuntu-latest`, and
  whether that npm version reads `allowScripts`, was not confirmed. Either way, the prebuilt
  binary is in the tarball and loads without any install script.
- Python/make/g++ being present on the Ubuntu 24.04 runner image was not checked against
  the image's software list. With a matching prebuild no compile happens, but the
  `node-gyp` configure step still runs.
- GitHub docs pages were read through a summarising fetch tool. Quoted strings are as it returned them.

# Build ledger: Featureful v2

One row per build ticket, built from timestamps and recorded usage rather than self-reports. Sources:

- **Start/end:** `prompts.txt` orchestration timestamps (start = implementer spawned) and GitHub PR open → merge times (PST, 2026-11-18/19).
- **Agent tokens:** the `subagent_tokens` figure from each implementer and reviewer run's completion notice. A resumed agent (a fix pass) reports again, so the figures are summed per ticket. They are what the harness reports, possibly context size rather than billed tokens. Agent dollar cost isn't available to the orchestrator.
- **App AI spend:** the exact cost line of each eval or ablation run (`source: eval`, local and CI), from `.scratch/v2/build-status.md`. No `seed` calls were made.
- **Fix passes:** orchestrator-requested passes after `/code-review` (standards + spec).
- **Accepted without fixes:** Y if merged with no fix pass.

| Ticket | Lane | Start | PR open → merge | Agent tokens (impl + review) | App AI spend | Fix passes | Accepted without fixes |
|---|---|---|---|---|---|---|---|
| 01 Build rails | 🔴 | 11-18 21:16 | #2 21:19 → 21:24 | 118.7k + 82.0k | $0.00 | 1 | N |
| 10 Effort/Risk AI estimate | 🟢 | 11-18 21:16 | #1 21:18 → 21:26 | 61.1k + 0 (Green: skim only) | $0.00 | 0 (orchestrator fixed a spacing nit) | Y |
| 02 Eval harness + v1 baseline | 🔴 | 11-18 21:28 | #3 21:37 → 21:48 | 278.9k + 137.3k | $0.62 | 1 | N |
| 03 AI call seam | 🔴 | 11-18 21:49 | #4 22:05 → 22:18 | 477.9k + 167.6k | $0.63 | 1 | N |
| 06 Boundary-notes ablation (CUT) | 🔴 | 11-18 21:49 | #8 11-19 10:09 → 10:21 | 766.4k + 135.7k | $1.21 | 1 | N |
| 04 Escalation | 🔴 | 11-18 22:19 | #5 11-19 09:46 → **parked** | 192.3k (+ a run cut off by the usage limit, unreported) | $0.48 | 0 | parked (eval gate) |
| 08 Delimit Customer text | 🔴 | 11-18 22:19 | #6 11-19 09:54 → 10:06 | 407.4k + 129.3k | $0.67 | 1 | N |
| 11 (Stretch) Evaluation freshness | 🟡 | 11-19 10:07 | #7 10:09 → 10:17 | 187.3k + 99.1k | $0.23 | 1 | N |
| 05, 07, 09 | | blocked by 04 | not started | | | | |
| 12 (Stretch) Build ledger | 🟢 | 11-19 10:20 | closing chore PR (orchestrator) | orchestrator's own | $0.00 | 0 | — |
| **Total** | | | **7 PRs merged, 1 parked** | **~2.49M + 0.75M** | **$3.83** (+ <$0.0001 key check) | 6 | 1 of 7 merged (the Green one) |

There was a ~11.5 hour gap with no work (2026-11-18 22:20 → 2026-11-19 09:46): the orchestrating session hit its Claude Code usage limit.

## Where the bottleneck moved

Early on, the bottleneck was **review**. Every Red or Yellow PR came back from `/code-review` with at least one real fix: a cost cap that wasn't a hard stop, an error-swallowing failure path, a spoofable AI-call link, a gate loosened by accident, escaping that could be bypassed, and an `evaluatedAt` race. So every reviewed ticket needed exactly one fix pass, and none needed a second.

Once the eval gate existed, the bottleneck moved to **eval spend and eval noise**. Each push to an AI-file PR re-runs a ~$0.22 live eval, which forced single-push discipline. Then the 26-Request replay turned out to be too noisy for its own gate. The same commit scored replay F1 0.846 locally and 1.000 in CI, so one split moves F1 by ±0.1–0.15, more than the −0.05 threshold. That parked ticket 04 and, with it, the whole remaining critical path (05, 07, 09). The next bottleneck is a **human decision about the gate's design**, not more agent work.

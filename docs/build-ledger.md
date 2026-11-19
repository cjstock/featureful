# Build ledger: Featureful v2

One row per build ticket, built from timestamps and recorded usage rather than self-reports. Sources:

- **Start/end:** `prompts.txt` orchestration timestamps (start = implementer spawned) and GitHub PR open → merge times (PST, 2026-11-18/19).
- **Agent tokens:** the `subagent_tokens` figure from each implementer and reviewer run's completion notice, summed per ticket across runs (fix passes resume the agent). The harness's figure may be context size rather than billed tokens, and some resumed runs reported cumulatively (noted), so treat these as rough magnitudes. Agent dollar cost isn't available to the orchestrator.
- **App AI spend:** the exact cost line of each eval or ablation run (`source: eval`, local and CI), from `.scratch/v2/build-status.md`. No `seed` calls were made.
- **Fix passes:** orchestrator-requested passes after `/code-review` (standards + spec), or after a Green skim.
- **Accepted without fixes:** Y if merged with no fix pass.

| Ticket | Lane | Start | PR open → merge | Agent tokens (impl + review) | App AI spend | Fix passes | Accepted without fixes |
|---|---|---|---|---|---|---|---|
| 01 Build rails | 🔴 | 11-18 21:16 | #2 21:19 → 21:24 | 118.7k + 82.0k | $0.00 | 1 | N |
| 10 Effort/Risk AI estimate | 🟢 | 11-18 21:16 | #1 21:18 → 21:26 | 61.1k + 0 (Green: skim) | $0.00 | 0 (orchestrator fixed a spacing nit) | Y |
| 02 Eval harness + v1 baseline | 🔴 | 11-18 21:28 | #3 21:37 → 21:48 | 278.9k + 137.3k | $0.62 | 1 | N |
| 03 AI call seam | 🔴 | 11-18 21:49 | #4 22:05 → 22:18 | 477.9k + 167.6k | $0.63 | 1 | N |
| 06 Boundary-notes ablation (CUT) | 🔴 | 11-18 21:49 | #8 11-19 10:09 → 10:21 | 766.4k + 135.7k | $1.21 | 1 | N |
| 04 Escalation | 🔴 | 11-18 22:19 | #5 11-19 09:46 → 10:48 (parked 09:51–10:28 on a noisy F1 gate) | 710.1k + 153.7k | $0.98 | 1 | N |
| 08 Delimit Customer text | 🔴 | 11-18 22:19 | #6 11-19 09:54 → 10:06 | 407.4k + 129.3k | $0.67 | 1 | N |
| 11 (Stretch) Evaluation freshness | 🟡 | 11-19 10:07 | #7 10:09 → 10:17 | 187.3k + 99.1k | $0.23 | 1 | N |
| 05 Escalation inbox | 🟢 | 11-19 10:49 | #10 10:57 → 10:59 | 142.4k + 0 (Green: skim) | $0.00 | 0 | Y |
| 07 Budget, rate limit, off switch | 🔴 | 11-19 10:49 | #11 11:38 → 11:55 | 311.0k (cumulative across resumes) + 155.5k | $0.73 | 1 | N |
| 09 Inbox metrics | 🔴 (migration added in fix pass) | 11-19 11:56 | #12 12:02 → 12:12 | 283.4k + 117.9k | $0.25 | 1 | N |
| 12 (Stretch) Build ledger | 🟢 | 11-19 10:20 | #9 + closing chore PR (orchestrator) | orchestrator's own | $0.00 | 0 | — |
| **Total** | | 11-18 21:16 → 11-19 ~12:20 | **11 ticket PRs + 2 chore PRs merged** | **~3.74M + 1.18M** | **$5.33** (+ <$0.0001 key check) | **9** | **2 of 11** (both Green) |

Interruptions:
- 2026-11-18 22:20 → 2026-11-19 09:46: ~11.5 hours with no work, because the orchestrating session hit its Claude Code usage limit.
- 2026-11-19 ~11:10: a network error killed the ticket 07 implementer.
- 2026-11-19 ~11:26: a second usage-limit stop, reset by the human.

## Where the bottleneck moved

1. **Review.** Every Red or Yellow PR came back from `/code-review` with at least one real defect, and each was fixed in exactly one pass; none needed a second. The defects were:
   - a cost cap that wasn't a hard stop;
   - an error-swallowing failure path;
   - a spoofable AI-call link;
   - a gate loosened by accident;
   - escaping that could be bypassed;
   - an `evaluatedAt` race;
   - Escalation reasons trusted from the client;
   - an unmetered Matcher endpoint that could drain the daily budget;
   - a biased time-to-decision proxy.

   Only the two Green UI tickets merged without fixes.
2. **Eval spend and eval noise.** Once the eval gate existed, each push to an AI-file PR re-ran a ~$0.25 live eval. That forced single-push discipline, and later CI-only evals.
   - **Noise:** the 26-Request replay proved noisier than its own gate. The same commit scored F1 0.846 locally and 1.000 in CI, and one split moves F1 by ±0.1–0.15 against a −0.05 threshold. That parked ticket 04, and with it the whole remaining critical path, until a required rebase re-ran the eval and it passed.
   - **Cost:** the gate keeps measuring against v1's $0.209. v2 runs at $0.25–0.26 (+21–23%), because 08 added the injection check and 04 added `closestProblem`. The next AI-file change has little room under the 25% limit.
3. **Human decisions.** The next bottleneck is decisions about gate design (replay noise, the cost baseline) and the Red-lane reviews. More agent work won't move it.

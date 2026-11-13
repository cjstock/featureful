# 02: Priority scoring module (test-first)

**What to build:** A pure Priority scoring module that turns the AI criterion scores (Impact, Strategic fit, Effort, Risk, each 1–5 or missing), a supporter count, weights, and an optional PM override into a 0–100 Priority score plus a breakdown for each criterion. Built test-first.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Demand maps supporter count to 1–5 by fixed thresholds: 1→1, 2–3→2, 4–5→3, 6–8→4, 9+→5
- [ ] Effort and Risk are inverted (6 − score); each criterion is normalized as (s − 1) / 4 and weighted
- [ ] Default weights (Demand 25, Impact 25, Strategic fit 20, Effort 15, Risk 15) live in one config file
- [ ] The total is bounded to 0–100
- [ ] A Problem not yet evaluated (missing AI scores) gets a defined, documented result (e.g. Demand-only score flagged as "not evaluated")
- [ ] An override replaces the total while the computed total is still returned
- [ ] Vitest tests cover thresholds, inversion, weighting, bounds, the not-evaluated case, and overrides, through the public interface only

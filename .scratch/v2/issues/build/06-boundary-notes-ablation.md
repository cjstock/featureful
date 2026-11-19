# 06: Boundary-notes ablation and the keep-or-cut decision

**What to build:** A three-arm ablation over 8–10 boundary-sensitive fixed-state cases: (a) neither notes nor examples, (b) Matching examples only, (c) examples + Boundary notes. Each arm runs twice, then the human decides keep or cut, and ADR 0003 records it. Then do the chosen branch's removal or keep work. Detail: [ablation ticket](../06-boundary-notes-earn-their-place.md).

**Lane:** 🟡 Yellow. The decision is the human's (HITL).

**Blocked by:** 02

**Status:** done ([#8](https://github.com/cjstock/featureful/pull/8)): **CUT**, decided by rule overnight; the human may overturn (ADR 0003; ceiling effect noted). Runnable ablation record: branch `archive/06-ablation-runner` (64581dd9).

- [ ] 8–10 `kind: boundary` cases where the PM's line isn't obvious from titles (e.g. roast-data import vs profile import, export vs personal copy, grinder retention vs calibration), each with a simulated review.
- [ ] Fixtures: the reviews as Matching examples. Notes are generated **once** by the real Boundary-note writer from those reviews and committed under `evals/matcher/ablation/`, with the human checking them in the PR.
- [ ] `npm run eval -- --ablation` runs the three arms twice: about 60 calls, under $1, within the eval cap. It reports boundary-case wins per arm per run, golden-case regressions, and cost per Request per arm.
- [ ] **Human decides.** Keep only if (c) beats (b) by ≥2 boundary cases on **both** runs with no golden regression.
- [ ] `docs/adr/0003-boundary-notes-on-ablation-evidence.md` records the numbers and the decision, amending step 3 of ADR 0002.
- [ ] **If cut:** remove the Boundary-note writer, the Matcher prompt section, the editor, the background distillation and the column (by migration). Remove the glossary entry. The eval stays green.
- [ ] **If kept:** stop the silent background rewrite; the inbox ticket builds the Suggest step. Change the glossary entry to "…accepted by a PM". Add a `boundary_note_revisions` table (problem, note, accepted_by, accepted_at, ai_call_id).

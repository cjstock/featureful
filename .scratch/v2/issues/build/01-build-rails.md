# 01: Build rails: charter, PR template, incident rules, CI checks

**What to build:** The delivery rails v2 is built on.
- A delegation charter with Green/Yellow/Red lanes.
- A PR template that declares AI involvement.
- The four v1 incident rules promoted into `CLAUDE.md`.
- A CI workflow whose `checks` job runs lint, typecheck and test on every PR to `v2` and `main`.

Detail: [delegation charter ticket](../08-delegation-charter.md).

**Lane:** 🔴 Red (CI workflow)

**Blocked by:** None

**Status:** ready-for-agent (plus a human checklist)

- [ ] `docs/agents/delegation-charter.md`: you are the decision owner on every ticket. It defines what's in each lane and the review depth for each: Green = checks + skim; Yellow = diff + eval vs baseline; Red = line by line + failure-path tests. A PR takes the highest lane it touches. It's linked from `CLAUDE.md`.
- [ ] `.github/pull_request_template.md` has these sections:
  - ticket link
  - AI involvement (agent, model, what the human did)
  - lane
  - diff inventory by area
  - the 10 checks as checkboxes with N/A allowed
  - eval result vs baseline
  - what this can't tell you
- [ ] `CLAUDE.md` gets four incident rules, each with a one-line reason:
  - never stage `.env`; run `jj st` first
  - the DB client re-runs migrations after a schema change (the `globalThis` connection survives hot reload)
  - restart the dev server after jj rewrites CSS
  - no live AI calls outside the budget guard or a dry run
- [ ] `.github/workflows/ci.yml`: a `checks` job (`npm ci`, lint, typecheck, test) on PRs to `v2` and `main`, on `ubuntu-latest`.
- [x] `v2` pushed; `ANTHROPIC_API_KEY` repo secret set (2026-11-18).
- [ ] Orchestrator (per the build runbook): once `checks` has run on this PR, turn on branch protection on `v2` requiring `checks` (no required reviews).

# Project Rules
## Prompt Logging
Every time you receive a new instruction or prompt, append it to prompts.txt in the project root with a timestamp (ISO 8601) and a brief summary of what you did in response. Create the file if it doesn't exist. Keep this log updated throughout all sessions.


## Version control
Use `jj` (colocated with git) for all local VCS operations, not raw `git`.

## Delegation charter

The human is the decision owner on every ticket; agents prepare. Lanes (Green/Yellow/Red), review depth and PR shape are in `docs/agents/delegation-charter.md`. Every PR uses `.github/pull_request_template.md`.

## Incident rules

Promoted from v1 incidents. Each rule carries its reason.

- **Never stage `.env`; run `jj st` before describing a change.** Reason: jj snapshots the whole working copy with no explicit add, so a secret is committed the moment it stops being ignored.
- **After a schema change, the DB client must re-run migrations.** Reason: the cached `globalThis` connection survives hot reload, so a running dev server keeps using the old schema.
- **Restart the dev server after jj rewrites CSS.** Reason: jj rewrites files in place when it switches or rebases changes, and the dev server's CSS pipeline doesn't always pick those writes up, so it keeps serving the old compiled CSS.
- **No live AI calls outside the budget guard or a dry run.** Reason: an unguarded call spends real money with no cap and leaves no AI call record.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.

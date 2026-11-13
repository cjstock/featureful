# 01: Problems I've asked about, first and marked

**What to build:** For a Customer, "Problems I support" lists the Problems they've asked about (those with at least one of their own Requests as Evidence) first, then the ones they only support, with the chosen sort applied within each group. Both Customer tabs show a subtle "You asked" marker on those Problems, with a hover hint giving the count of their Requests. Internal views are unchanged.

**Blocked by:** colour ticket 02 (`.scratch/ui-color/issues/02-priority-criteria-roles-review-colours.md`), since both touch the Customer card

**Status:** done

- [x] `listProblems` returns each item's count of the viewer's own Requests for Customer views; "Problems I support" orders asked-about first, then by the chosen sort; All Problems is not reordered
- [x] Search and Status filter still apply
- [x] Customer card shows a muted "You asked" marker with an icon and a hover hint ("You submitted N Request(s) for this Problem"); no strong colour
- [x] Vitest tests on `listProblems` with in-memory SQLite cover the spec's cases
- [x] Typecheck, vitest, eslint and next build pass

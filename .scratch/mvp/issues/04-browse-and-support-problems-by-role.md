# 04: Browse and Support Problems by role

**What to build:** Users discover Problems and show Support. Customers see a simple home page (problem statement, Status, support count, Decision note, a Support button, and a "Problems I support" view). Internal stakeholders see a home page with the Priority score, support count, Status, and Evidence count. Both can search by keyword, filter by Status, and sort by priority, support, or newest. The Problem page also differs by role.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] The home page branches on the current person's role
- [ ] Keyword search over Problem title/need, a Status filter, and sorting by priority / support / newest
- [ ] Priority uses the scoring module (02), with Demand computed live from the supporter count
- [ ] Customers can add and remove Support with one click; they can't Support the same Problem twice
- [ ] On the Problem page, Customers see the statement, Status, support count, Decision note, and only their own Requests; never other Customers' Request text, scores, or briefs
- [ ] On the Problem page, Internal stakeholders see the statement, all Evidence (author and text), supporters, Status, and Decision note
- [ ] UI copy keeps "Support" (the action) distinct from "Support agent" (the role)

# 08: Status changes and Decision notes

**What to build:** A PM changes a Problem's Status (Open, Planned, In progress, Shipped, Declined) and attaches a Decision note explaining why. The PM can ask the AI to draft the note from the brief and Evidence, written for Customers, then edit it before saving. Customers see the Status and Decision note on the home page and the Problem page.

**Blocked by:** 04, 07

**Status:** ready-for-agent

- [ ] PM-only Status change action that saves Status and Decision note together
- [ ] The Decision note drafter is one LLM call taking the Problem, its brief (if present), the target Status, and its Evidence; it works without a brief
- [ ] The drafted note fills an editable field and is only saved when the PM confirms
- [ ] The Status filter on the home pages reflects the new Status
- [ ] The Decision note is visible to Customers and Internal stakeholders

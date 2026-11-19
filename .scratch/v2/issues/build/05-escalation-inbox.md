# 05: Match review Escalation inbox UI

**What to build:** `/review` becomes the triage inbox from the prototype: the queue grouped by strongest reason on the left, and a detail pane comparing the new Request with the Problem's need and Evidence on the right. It has keyboard flow and auto-advance. The header strip is reserved for the metrics ticket. If the Boundary-notes ablation kept notes, the detail pane shows the suggestion step after a Move or Split. Detail: [prototype ticket](../05-match-review-queue-prototype.md). Reference code is on bookmark `prototype/match-review-queue` (`src/app/review/prototype-variants.tsx`, `VariantB`). Rewrite it properly; don't copy it.

**Lane:** 🟢 Green (UI). 🟡 if the suggestion step lands here.

**Blocked by:** 04, 06

**Status:** ready-for-agent (blocked: 04 is parked, needs-human)

- [ ] Left pane: groups by strongest reason in rank order, with counts and items oldest first. The last group is "Not escalated" (Auto-accepted, still reviewable). Done items show struck through.
- [ ] Detail pane, from top to bottom:
  - reason chips, with the detail on hover
  - the question: "Does this Request share the need of this Problem?"; "Is this a new need, or the same as this Problem?" for a near miss; "Group this Request" when bypassed
  - the Request side by side with the compared Problem (need, supporter count, up to 3 Evidence excerpts)
  - the Matcher's reason and confidence, and the AI call line
- [ ] Verdicts:
  - "Same need ✓" (Confirm) saves in one click.
  - "Belongs on another Problem" (Move) and "Needs its own Problem" (Split) open an inline form with a required note ("What makes these different needs?") and "Add as Regression case", ticked.
  - Bypassed decisions offer "Belongs on an existing Problem" / "Keep as its own Problem".
- [ ] Keyboard: `j`/`k` move and `1`/`2`/`3` pick a verdict, ignored while typing. Saving a verdict advances to the next open item.
- [ ] (If notes were kept) After a Move or Split, a suggested revision appears for each affected Problem as a diff, with Accept / Edit / Dismiss. Nothing changes until it's accepted. An accepted note stores who accepted it, when, and the drafting AI call id.
- [ ] PM-only, as before. The existing match-review tests still pass.

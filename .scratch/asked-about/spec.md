# Spec: Customers see the Problems they've asked about first

Status: ready-for-agent

## Problem Statement

A Customer looking at "Problems I support" can't tell which of those Problems they actually asked for themselves, by submitting a Request, and which they only clicked Support on. The Problems they care about most are mixed in with everything else. On the All Problems tab, there is no hint either that a Problem already holds one of their Requests.

## Solution

For a Customer, a **Problem I've asked about** is a Problem with at least one of their own Requests as Evidence.

- On the "Problems I support" tab, Problems they've asked about come first, then the ones they only support. The chosen sort still applies within each group.
- On both Customer tabs, Problems they've asked about carry a subtle "You asked" marker. Hovering it shows how many of their Requests that Problem holds.

Internal stakeholders' views don't change.

## User Stories

1. As a Customer, I want the Problems I've asked about listed first on "Problems I support", so that the needs I raised myself are easy to follow.
2. As a Customer, I want the Problems I only support listed after the ones I've asked about, so that I still see everything I support.
3. As a Customer, I want my chosen sort (priority, support, newest) to still apply within each group, so that ordering stays predictable.
4. As a Customer, I want my search and Status filter to still apply on "Problems I support", so that the new ordering doesn't break filtering.
5. As a Customer, I want a subtle "You asked" marker on Problems I've asked about, so that I can recognise them without it shouting over Status colours.
6. As a Customer, I want a hover hint ("You submitted N Request(s) for this Problem"), so that I know how much of the Evidence is mine.
7. As a Customer, I want the marker on the All Problems tab too, without reordering that tab, so that I can recognise my Problems while browsing everything.
8. As a Customer whose Request a PM moved to another Problem, I want the marker to follow my Request, so that it always reflects where my Requests are now.
9. As a Customer who asked about a Problem but later removed my Support, I want it not to appear on "Problems I support", so that the tab still means what it says.
10. As a Support agent or PM, I want my home views unchanged, so that internal triage isn't affected.

## Implementation Decisions

- **Problems data layer:**
  - The list query gains a per-viewer count of the viewer's own Requests on each Problem, derived from the requests table. There is no schema change.
  - When the viewer is a Customer and the view is "Problems I support", results are ordered with asked-about first, then by the chosen sort.
  - All Problems keeps its existing order but still carries the count.
  - The count is only computed and used for Customer views.
- **Customer card:** shows a small, muted "You asked" label with a speech-bubble icon from the existing icon set. A title or tooltip gives the count. It uses no strong colour, so that it doesn't compete with the Status tones from the colour pass.
- **Ordering with colour ticket 02:** build after colour ticket 02 lands, because both touch the Customer card.

## Testing Decisions

- Tests check `listProblems` through its public interface on in-memory SQLite. This is the same style as the existing Intake tests. It's a new seam, added at the existing data-layer function.
- Cases:
  - asked-about Problems come first on "Problems I support";
  - the chosen sort holds within each group;
  - each item's own-Request count is correct;
  - All Problems isn't reordered;
  - a Problem the Customer asked about but no longer supports doesn't appear on "Problems I support";
  - the count follows a Request when it is moved between Problems.
- The marker UI is checked by eye.

## Out of Scope

- An "originating Request" concept or schema change.
- Separate group headings.
- Showing the marker to Internal stakeholders.
- Notifying Customers when their Request moves.

# Spec: Colour pass for readability, plus dark mode

Status: ready-for-agent

## Problem Statement

The whole app uses the stock neutral black-and-white theme. Status, Priority score, how much each criterion helps or hurts, Match confidence, review verdicts, and the current role all look the same, so a user has to read every label to know what they're looking at. Scanning the Problem list or the review queue is slow, and nothing visually separates a high-priority Problem from a low one, or Shipped from Declined. There is also no dark mode.

## Solution

Colour carries meaning, on top of a warm coffee-inspired brand palette:
- Status, Priority score bands, criterion meters, Match confidence, review verdicts, and roles each get consistent semantic colours.
- The app follows the operating-system light/dark setting by default.
- A header toggle switches between System, Light, and Dark and remembers the choice.
- Every coloured element keeps its text label.
- Contrast meets WCAG AA in both themes.

## User Stories

### Palette and theme

1. As any user, I want a warm, coffee-inspired palette (espresso primary, cream-tinted background, warm greys), so that the app feels like a product for coffee enthusiasts rather than a bare template.
2. As any user, I want the app to follow my operating system's light or dark setting by default, so that it matches the rest of my desktop.
3. As any user, I want a header toggle that switches between System, Light, and Dark, so that I can override the OS setting.
4. As any user, I want my theme choice remembered across visits without a flash of the wrong theme on load, so that the app feels polished.
5. As any user, I want every semantic colour to stay readable in both light and dark themes, so that dark mode isn't a second-class experience.
6. As a user with colour-vision differences, I want every coloured element to keep its text label, so that I never depend on colour alone.
7. As any user, I want text and badge contrast to meet WCAG AA, so that everything is legible.

### Status

8. As any user, I want each Status shown in its own colour (Open slate-blue, Planned violet, In progress amber, Shipped green, Declined muted rose), so that I can tell where a Problem stands at a glance.
9. As any user, I want Problem cards and rows to carry a coloured left edge for their Status, so that I can scan a long list by Status.
10. As any user, I want the Status filter options to show the same colours, so that the filter and the list read consistently.

### Priority

11. As an Internal stakeholder, I want the Priority score shown as a coloured chip (70 and above green, 40–69 amber, below 40 grey), so that I can spot high-priority Problems instantly.
12. As an Internal stakeholder, I want "Not evaluated" shown as a grey dashed chip, so that unscored Problems are clearly different from low-scoring ones.
13. As an Internal stakeholder, I want a PM override marked with a violet "Override" badge next to the score, so that overridden scores stand out.
14. As an Internal stakeholder, I want each criterion in the score breakdown shown as a five-dot meter, coloured by how much that criterion helps the Priority score, with Effort and Risk inverted so that low Effort and low Risk read as good, so that I can judge the breakdown without doing the arithmetic.

### Roles

15. As any user, I want the identity switcher to show a coloured role chip (Customer teal, Support agent sky-blue, PM espresso), so that I always know which view I'm in.

### Match review

16. As a PM, I want Match review verdict badges in distinct colours (Confirm green, Move blue, Split amber), so that I can scan the Reviewed tab quickly.
17. As a PM, I want Match confidence coloured by band (0.85 and above green, 0.6–0.84 amber, below 0.6 rose), so that I can spot shaky matches to review first.
18. As a PM, I want a submitter's "mine is different" choice highlighted, so that the most interesting decisions catch my eye.

### Everywhere

19. As any user, I want Support counts, links, and primary buttons to use the brand accent, so that actions are easy to find.
20. As any user, I want the colour language to be consistent across the home page, Problem page, review queue, submit flow, and Product Strategy page, so that I learn it once.

## Implementation Decisions

- **Theme tokens:**
  - Replace the neutral shadcn tokens with a warm palette for light and dark: background, foreground, card, muted, border, primary, accent, ring, and so on.
  - Add semantic tokens for each tone: status-open, status-planned, status-progress, status-shipped, status-declined, positive, caution, negative, neutral, override, role-customer, role-support, role-pm.
  - Each tone has a solid colour plus a subtle background and foreground pair for badges, defined in both themes.
  - Dark mode uses the existing class-based dark variant.
- **Theme selection:**
  - A cookie stores the preference: system, light, or dark. The default is system.
  - The root layout reads the cookie on the server and sets the dark class when the preference is dark.
  - For system, a tiny inline script in the document head applies the dark class from the media query before paint, and keeps it in sync when the OS setting changes. This avoids a flash of the wrong theme.
  - The header toggle cycles System → Light → Dark and is a client component; no extra dependency.
- **Tone module (pure, the test seam):**
  - It maps domain values to semantic tone names, and is the only place the thresholds live.
  - Functions:
    - Priority score total, or not evaluated → band: positive at 70 and above, caution at 40–69, neutral below 40, plus a not-evaluated case.
    - Match confidence → band: positive at 0.85 and above, caution at 0.6–0.84, negative below 0.6.
    - Criterion plus its 1–5 score → how much it helps: Effort and Risk are inverted; for example, adjusted 4–5 is positive, 3 is caution, 1–2 is negative.
    - Status → tone.
    - Verdict → tone.
    - Role → tone.
  - Components ask the tone module for a tone and render it through shared badge, chip, and meter components. Components never hard-code colours.
- **Shared UI pieces:**
  - The Badge gains tone variants.
  - A score chip and a five-dot criterion meter are added.
  - Reuse them in the status badge, score breakdown, internal home table, Customer cards, review queue, and identity switcher.
- **Constraints:**
  - No schema or server-action changes.
  - No new runtime dependencies.
  - Keep the existing Base UI and shadcn conventions, including `nativeButton={false}` when a Button renders a Link.

## Testing Decisions

- Good tests check external behaviour through the public interface only.
- **Tone module:** Vitest unit tests covering:
  - the Priority score band edges (39/40, 69/70) and not evaluated;
  - the confidence band edges (0.6, 0.85);
  - criterion inversion for Effort and Risk versus the other criteria;
  - that every Status, verdict, and role maps to a tone.
- **Not automatically tested:** styling, contrast, and dark mode. Check them with typecheck and build, then by the user eyeballing light and dark in the browser.
- **Prior art:** the existing pure scoring module tests.

## Out of Scope

- Visually marking AI-generated content.
- Layout redesigns, new pages, icons beyond what already exists, and animations.
- Charts and data visualizations beyond the five-dot criterion meter.
- Per-user theme storage in the database.
- Automated visual or contrast tests.

## Further Notes

- **Colour terms:** the colour names (slate-blue, violet, and so on) are design intent. The implementer chooses exact OKLCH values that meet AA contrast in both themes.
- **"Support":** Support (the action) and Support agent (the role) share a word. The role chip colour (sky-blue) must differ from the Support-count accent, so the two aren't confused.

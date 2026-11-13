# 02: Priority, criteria, roles and Match review colours

**What to build:** Using the tone module and tokens from 01, the rest of the app gets colour that carries meaning. Priority scores show as coloured chips: green, amber or grey, a dashed "Not evaluated" chip, and a violet Override badge. The score breakdown shows a five-dot meter per criterion, coloured by how much it helps the Priority score. The identity switcher shows a coloured role chip. The review queue colours its verdict badges and Match confidence and highlights "mine is different". Support counts and primary actions use the brand accent.

**Blocked by:** 01

**Status:** done

- [x] Shared score chip and five-dot criterion meter components, driven only by the tone module (no hard-coded colours)
- [x] Internal home table and Problem page use the score chip; the Override badge is violet; Not evaluated is dashed grey
- [x] Score breakdown uses the criterion meter, with Effort and Risk inverted
- [x] Identity switcher role chip: Customer teal, Support agent sky-blue, PM espresso (distinct from the Support-count accent)
- [x] Review queue: verdict badges (Confirm green, Move blue, Split amber), confidence chip by band, "mine is different" highlighted
- [x] Every coloured element keeps its text label; checked in light and dark
- [x] Typecheck, vitest, eslint and next build pass

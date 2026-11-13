# 01: Palette, dark mode and Status colours

**What to build:** The app gets a warm, coffee-inspired light and dark palette, plus semantic tone tokens. It follows the OS theme by default, and a header toggle switches between System, Light and Dark, remembered in a cookie with no flash of the wrong theme. A pure tone module maps domain values to tones and is unit-tested. Status now shows in colour everywhere: badges, a left edge on Problem cards and rows, and the Status filter.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Warm light and dark tokens (espresso primary, cream background, warm greys) plus semantic tone tokens (solid, subtle background, and foreground for each tone) in both themes, meeting AA contrast
- [x] Theme cookie (system / light / dark, default system); the server sets the dark class for "dark"; an inline head script handles "system" before paint and follows OS changes
- [x] Header toggle cycling System → Light → Dark (client component, no new dependency)
- [x] Tone module with all mappings from the spec (Priority band, confidence band, criterion helps/hurts with Effort and Risk inverted, Status, verdict, role) and Vitest tests on the edge cases the spec lists
- [x] Badge supports tone variants; Status badge, card/row left edge, and Status filter use the Status tones
- [x] Typecheck, vitest, eslint and next build pass

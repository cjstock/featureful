# 09: Coffee-app seed data

**What to build:** A developer runs one seed command and gets a realistic demo. The database is reset, the people are created (about 8 Customers who are home roasters/brewers, Support agent Dana, PM Sam), the default Product Strategy is set (serious home roasters; data ownership; brew repeatability), and about 25 Requests for a coffee-tracking app (beans, roasts, brews, recipes) are submitted through the real Intake pipeline, auto-accepting the Matcher's proposal, then evaluated.

**Blocked by:** 03, 05

**Status:** done

- [x] A static seed data file holds about 25 Requests with deliberate near-duplicates (e.g. several ways of asking for roast-log export or brew-ratio calculators) and some Requests from Support agent Dana
- [x] Extra Support links from Customers who didn't submit to a Problem
- [x] The seed runs sequentially through Intake (real Matcher) and then the Evaluator, logging each match/new-Problem decision to the console
- [x] The seed is idempotent via reset (it wipes and rebuilds)
- [x] The README gains the seed step and a note that it calls the Anthropic API (cost and time)
- [ ] After seeding, the home pages show a mix of multi-Evidence and single-Evidence Problems with scores (pending the one real run; dry run gives 26 Requests -> 16 Problems, 6 multi-Evidence)

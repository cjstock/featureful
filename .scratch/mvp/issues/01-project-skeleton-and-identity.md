# 01: Project skeleton and identity switcher

**What to build:** A developer can clone the repo, follow the README, and run the app locally. In the browser they can switch between a Customer, Support agent, or PM identity from the header and see an (empty) Problems home page. The full database schema from the spec exists (people, product_strategy, problems, requests, supports), and Vitest runs.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Next.js (App Router, TypeScript), Tailwind + shadcn/ui, Drizzle + SQLite, Vercel AI SDK + Anthropic provider, and Vitest are installed and configured
- [x] A single config constant holds the Claude model name; `ANTHROPIC_API_KEY` is read from `.env` (with `.env.example` committed)
- [x] The schema covers people, product_strategy, problems (with AI score/reason fields, override fields, brief fields, Status, Decision note), requests, and supports (unique on person and Problem)
- [x] A minimal people bootstrap (a few Customers, Support agent Dana, PM Sam) exists so the switcher works before ticket 09
- [x] The header identity switcher sets a cookie; the current person is available to server components and actions
- [x] The home page renders an empty state when there are no Problems
- [x] `.gitignore` excludes node_modules, .env, the SQLite db file, and .next
- [x] The README covers prerequisites, install, `.env` setup, database push/migrate, running the dev server, and running tests; local only, no deployment

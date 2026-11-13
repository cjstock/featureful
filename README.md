# Featureful

An AI-first feature intelligence system. Everyone (Customers, Support agents
and PMs) can submit Requests and toggle their Support on Problems; the AI turns
Requests into underlying Problems, scores them, and helps a PM decide. See `GLOSSARY.md` for the vocabulary. Runs locally only.

## Prerequisites

- Node.js 22 or newer (developed on Node 26) and npm
- An Anthropic API key

## Install

```bash
npm install
```

## Environment

```bash
cp .env.example .env
```

Then set `ANTHROPIC_API_KEY` in `.env`. Optionally set `DATABASE_PATH`
(defaults to `data/featureful.db`). The Claude model name lives in one
constant, `CLAUDE_MODEL` in `src/lib/config.ts`.

## Database

The app uses SQLite (via Drizzle). Apply the migrations in `drizzle/` with:

```bash
npm run db:migrate
```

The app also applies pending migrations itself when it first opens the
database, so this step is optional. On an empty database the app adds a few
people (Customers Alex, Priya and Marco, Support agent Dana, PM Sam) so the
identity switcher works.

If you change `src/db/schema.ts`, generate a new migration with
`npm run db:generate`. To start over, delete the `data/` folder.

## Seed demo data

```bash
npm run seed
```

This wipes the database and rebuilds a coffee-tracking app demo: 8 Customers
(home roasters and brewers), Support agent Dana, PM Sam, the default Product
Strategy, and about 25 Requests (with deliberate near-duplicates) submitted
through the real Intake pipeline, then every Problem is evaluated. Re-running
it starts over from scratch. The data lives in `scripts/seed-data.ts`.

**It calls the Anthropic API**: one call per Request plus one per Problem,
about 45 calls in all (a few minutes; roughly $0.50 to $1 with the default
model). It runs sequentially, never retries a failed call itself, and aborts
rather than make more than 60 calls (`npm run seed -- --max-ai-calls=<n>` to
change). It needs `ANTHROPIC_API_KEY` in `.env` and stops immediately without
it. To check the pipeline offline, `npm run seed -- --dry-run` uses a fake
Matcher, skips evaluation and writes to an in-memory database (add
`--db=<path>` to keep it).

## Run the dev server

```bash
npm run dev
```

Open http://localhost:3000 and pick who you are from the switcher in the
header. Your choice is stored in a cookie.

## Match review: how the Matcher learns

Every submitted Request records a Matching decision: what the Matcher proposed
and what the submitter chose. PMs work through these in the review queue
(**Match review** in the header, `/review`) and Confirm, Move (to another
Problem) or Split (into a new Problem) each one, with an optional note. Moving
or splitting relocates the Request and its Support and re-evaluates the
affected Problems.

The Matcher learns from these reviews in its prompt (ADR 0002): it sees up to
20 recent Matching examples, corrections first, and each Problem's Boundary
note, a short "Includes … Does not include …" statement that the AI distils
from every Move, Split, or Confirm with a note. Internal stakeholders see the
Boundary note on the Problem page, and PMs can edit it there.

## Tests and checks

```bash
npm test            # Vitest, once
npm run test:watch  # Vitest in watch mode
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
```

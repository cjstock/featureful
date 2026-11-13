# Featureful

An AI-first feature intelligence system. Customers and Support agents submit
Requests; the AI turns them into underlying Problems, scores them, and helps a
PM decide. See `GLOSSARY.md` for the vocabulary. Runs locally only.

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

## Run the dev server

```bash
npm run dev
```

Open http://localhost:3000 and pick who you are from the switcher in the
header. Your choice is stored in a cookie.

## Tests and checks

```bash
npm test            # Vitest, once
npm run test:watch  # Vitest in watch mode
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
```

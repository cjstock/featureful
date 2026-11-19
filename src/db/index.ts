import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { backfillEscalationReasons } from "@/lib/escalation";
import * as schema from "./schema";

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

function open(file: string) {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle({ client: sqlite, schema });
}

export type Db = ReturnType<typeof open>;

/**
 * Bring a database up to date: apply the SQL migrations in ./drizzle, then the data migrations
 * that need app logic (the Escalation reasons backfill). Each data migration is a no-op once done.
 */
export function migrateDb(db: Db) {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  backfillEscalationReasons(db);
}

/**
 * Open a SQLite database at `file` (a path, or ":memory:" for tests) and
 * bring it up to date (`migrateDb`).
 */
export function createDb(file: string): Db {
  const db = open(file);
  migrateDb(db);
  return db;
}

/**
 * Open an existing database read-only, without migrating it or running data migrations. For
 * tools that only read (`npm run eval:pull`). Throws if the file doesn't exist.
 */
export function openDbReadOnly(file: string): Db {
  const sqlite = new Database(file, { readonly: true, fileMustExist: true });
  return drizzle({ client: sqlite, schema });
}

export const DATABASE_PATH = process.env.DATABASE_PATH ?? "data/featureful.db";

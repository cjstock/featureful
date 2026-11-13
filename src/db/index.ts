import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/**
 * Open a SQLite database at `file` (a path, or ":memory:" for tests) and
 * bring its schema up to date by applying the migrations in ./drizzle.
 */
export function createDb(file: string) {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

export const DATABASE_PATH = process.env.DATABASE_PATH ?? "data/featureful.db";

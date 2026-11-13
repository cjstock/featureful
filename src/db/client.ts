import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb, DATABASE_PATH, MIGRATIONS_FOLDER, type Db } from "./index";
import { bootstrapPeople } from "./bootstrap";

const JOURNAL = path.join(MIGRATIONS_FOLDER, "meta", "_journal.json");

const globalForDb = globalThis as unknown as { featurefulDb?: Db; featurefulJournalMtime?: number };

function journalMtime(): number {
  try {
    return fs.statSync(JOURNAL).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * The app's database (server only). Opened once per process, migrated, and
 * bootstrapped with a few people. Tests should use `createDb(":memory:")`.
 *
 * The connection is cached on globalThis so it survives dev hot reloads; that
 * also means migrations added while the dev server runs would never apply. So
 * whenever the migration journal changes, re-run the migrator on the cached
 * connection.
 */
export function getDb(): Db {
  if (!globalForDb.featurefulDb) {
    fs.mkdirSync(path.dirname(path.resolve(DATABASE_PATH)), { recursive: true });
    const db = createDb(DATABASE_PATH);
    bootstrapPeople(db);
    globalForDb.featurefulDb = db;
    globalForDb.featurefulJournalMtime = journalMtime();
  } else {
    const mtime = journalMtime();
    if (mtime !== globalForDb.featurefulJournalMtime) {
      migrate(globalForDb.featurefulDb, { migrationsFolder: MIGRATIONS_FOLDER });
      globalForDb.featurefulJournalMtime = mtime;
    }
  }
  return globalForDb.featurefulDb;
}

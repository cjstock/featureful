import fs from "node:fs";
import path from "node:path";
import { createDb, DATABASE_PATH, type Db } from "./index";
import { bootstrapPeople } from "./bootstrap";

const globalForDb = globalThis as unknown as { featurefulDb?: Db };

/**
 * The app's database (server only). Opened once per process, migrated, and
 * bootstrapped with a few people. Tests should use `createDb(":memory:")`.
 */
export function getDb(): Db {
  if (!globalForDb.featurefulDb) {
    fs.mkdirSync(path.dirname(path.resolve(DATABASE_PATH)), { recursive: true });
    const db = createDb(DATABASE_PATH);
    bootstrapPeople(db);
    globalForDb.featurefulDb = db;
  }
  return globalForDb.featurefulDb;
}

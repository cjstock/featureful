import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_PATH ?? "data/featureful.db";
fs.mkdirSync(path.dirname(path.resolve(url)), { recursive: true });

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
});

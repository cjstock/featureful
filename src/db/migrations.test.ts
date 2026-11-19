/**
 * A migration must apply to a database that already holds v1 data, without losing any of it.
 * Builds a v1 database (migrations up to 0001 only) with people, a Problem, a Request and a
 * reviewed Matching decision, then runs every migration on it, as `getDb` does on startup.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { MIGRATIONS_FOLDER } from "@/db";
import * as schema from "@/db/schema";

const V1_TAGS = ["0000_init", "0001_match_review"];

let dir: string;
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** A copy of the migrations folder that stops at v1. */
function v1MigrationsFolder(): string {
  const folder = path.join(dir, "v1-migrations");
  fs.cpSync(MIGRATIONS_FOLDER, folder, { recursive: true });
  const journalPath = path.join(folder, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.filter((e: { tag: string }) => V1_TAGS.includes(e.tag));
  fs.writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

function open(file: string) {
  const sqlite = new Database(file);
  sqlite.pragma("foreign_keys = ON");
  return { sqlite, db: drizzle({ client: sqlite, schema }) };
}

describe("migration 0002_ai_calls", () => {
  it("applies to a v1 database with data, keeping every row and leaving the new fields empty", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "featureful-migration-"));
    const file = path.join(dir, "v1.db");

    // A v1 database, written with raw SQL so it doesn't depend on today's schema.
    const v1 = open(file);
    migrate(v1.db, { migrationsFolder: v1MigrationsFolder() });
    v1.sqlite.exec(`
      INSERT INTO people (id, name, role) VALUES (1, 'Alex', 'customer'), (2, 'Sam', 'pm');
      INSERT INTO problems (id, title, need, status, created_at, boundary_note)
        VALUES (1, 'Repeat a brew', 'I need to repeat a good brew.', 'open', 1, 'Includes recipes.');
      INSERT INTO requests (id, problem_id, author_id, title, description, created_at)
        VALUES (1, 1, 1, 'Save recipes', 'Let me save a recipe.', 1);
      INSERT INTO supports (person_id, problem_id, created_at) VALUES (1, 1, 1);
      INSERT INTO matching_decisions
        (id, request_id, proposed_problem_id, confidence, reason, proposed_title, proposed_need,
         submitter_choice, created_at, verdict, reviewer_id, reviewed_at, note)
        VALUES (1, 1, 1, 0.9, 'Same need', 'Repeat a brew', 'I need to repeat a good brew.',
         'accepted', 1, 'confirm', 2, 2, 'Right call');
    `);
    v1.sqlite.close();

    // Today's migrations on the same file.
    const now = open(file);
    migrate(now.db, { migrationsFolder: MIGRATIONS_FOLDER });

    const decision = now.db.select().from(schema.matchingDecisions).get()!;
    expect(decision).toMatchObject({
      id: 1,
      requestId: 1,
      reason: "Same need",
      verdict: "confirm",
      note: "Right call",
      promptVersion: null,
      aiCallId: null,
    });
    expect(now.db.select().from(schema.problems).get()).toMatchObject({ boundaryNote: "Includes recipes." });
    expect(now.db.select().from(schema.people).all()).toHaveLength(2);
    expect(now.db.select().from(schema.requests).all()).toHaveLength(1);
    expect(now.db.select().from(schema.supports).all()).toHaveLength(1);
    expect(now.db.select().from(schema.aiCalls).all()).toEqual([]);

    // The new link works, and deleting an AI call clears it rather than blocking the delete.
    const call = now.db
      .insert(schema.aiCalls)
      .values({
        module: "matcher",
        model: "claude-sonnet-5-5",
        promptVersion: "3f9a0000",
        outcome: "ok",
        source: "app",
        system: "system",
        prompt: "prompt",
      })
      .returning()
      .get();
    now.db
      .update(schema.matchingDecisions)
      .set({ aiCallId: call.id, promptVersion: call.promptVersion })
      .where(eq(schema.matchingDecisions.id, 1))
      .run();
    now.db.delete(schema.aiCalls).where(eq(schema.aiCalls.id, call.id)).run();
    expect(now.db.select().from(schema.matchingDecisions).get()).toMatchObject({
      aiCallId: null,
      promptVersion: "3f9a0000",
    });
    now.sqlite.close();
  });
});

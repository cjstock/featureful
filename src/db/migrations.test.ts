/**
 * A migration must apply to a database that already holds data, without losing any of it.
 * Each test builds a database at an earlier migration (v1: up to 0001; before the cut: up to
 * 0002; after the cut: up to 0003) with data in it, then runs every migration on it, as `getDb` does on startup.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createDb, MIGRATIONS_FOLDER } from "@/db";
import * as schema from "@/db/schema";

const V1_TAGS = ["0000_init", "0001_match_review"];
const PRE_CUT_TAGS = [...V1_TAGS, "0002_ai_calls"];
const POST_CUT_TAGS = [...PRE_CUT_TAGS, "0003_drop_boundary_note"];

let dir: string;
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** A copy of the migrations folder that stops after the given migrations. */
function migrationsUpTo(tags: string[]): string {
  const folder = path.join(dir, `migrations-${tags.length}`);
  fs.cpSync(MIGRATIONS_FOLDER, folder, { recursive: true });
  const journalPath = path.join(folder, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.filter((e: { tag: string }) => tags.includes(e.tag));
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
    migrate(v1.db, { migrationsFolder: migrationsUpTo(V1_TAGS) });
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
    expect(now.db.select().from(schema.problems).get()).toMatchObject({ id: 1, title: "Repeat a brew" });
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

/** The columns of a table, as SQLite has them. */
const columnsOf = (sqlite: Database.Database, table: string) =>
  (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

describe("migration 0003_drop_boundary_note (ADR 0003)", () => {
  it("drops the Boundary note column from a database with data, keeping every row and every other field", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "featureful-migration-"));
    const file = path.join(dir, "pre-cut.db");

    // A database just before the cut, with Boundary notes on Problems, written with raw SQL.
    const before = open(file);
    migrate(before.db, { migrationsFolder: migrationsUpTo(PRE_CUT_TAGS) });
    before.sqlite.exec(`
      INSERT INTO people (id, name, role) VALUES (1, 'Alex', 'customer'), (2, 'Sam', 'pm');
      INSERT INTO problems (id, title, need, status, decision_note, created_at, override_score, override_note, boundary_note)
        VALUES (1, 'Repeat a brew', 'I need to repeat a good brew.', 'planned', 'Next cycle.', 1, 70, 'Top ask', 'Includes recipes.'),
               (2, 'Night mode', 'I need a dark appearance.', 'open', NULL, 2, NULL, NULL, NULL);
      INSERT INTO requests (id, problem_id, author_id, title, description, created_at)
        VALUES (1, 1, 1, 'Save recipes', 'Let me save a recipe.', 1);
      INSERT INTO supports (person_id, problem_id, created_at) VALUES (1, 1, 1);
      INSERT INTO ai_calls (id, time, module, model, prompt_version, outcome, source, system, prompt)
        VALUES (1, 1, 'boundary_note', 'claude-sonnet-5-5', 'ab12cd34', 'ok', 'app', 'system', 'prompt');
      INSERT INTO matching_decisions
        (id, request_id, proposed_problem_id, confidence, reason, proposed_title, proposed_need,
         submitter_choice, created_at, verdict, reviewer_id, reviewed_at, note)
        VALUES (1, 1, 1, 0.9, 'Same need', 'Repeat a brew', 'I need to repeat a good brew.',
         'accepted', 1, 'confirm', 2, 2, 'Right call');
    `);
    expect(columnsOf(before.sqlite, "problems")).toContain("boundary_note");
    before.sqlite.close();

    const now = open(file);
    migrate(now.db, { migrationsFolder: MIGRATIONS_FOLDER });

    expect(columnsOf(now.sqlite, "problems")).not.toContain("boundary_note");
    expect(now.db.select().from(schema.problems).orderBy(schema.problems.id).all()).toMatchObject([
      { id: 1, title: "Repeat a brew", status: "planned", decisionNote: "Next cycle.", overrideScore: 70, overrideNote: "Top ask" },
      { id: 2, title: "Night mode", status: "open", decisionNote: null },
    ]);
    expect(now.db.select().from(schema.requests).all()).toMatchObject([{ id: 1, problemId: 1 }]);
    expect(now.db.select().from(schema.supports).all()).toHaveLength(1);
    expect(now.db.select().from(schema.matchingDecisions).get()).toMatchObject({ id: 1, verdict: "confirm", note: "Right call" });
    // AI call records from the retired Boundary-note writer stay readable.
    expect(now.db.select().from(schema.aiCalls).get()).toMatchObject({ id: 1, module: "boundary_note" });
    now.sqlite.close();
  });
});

describe("migration 0004_escalation and its backfill", () => {
  it("applies to a post-cut database (up to 0003) with data and computes Escalation reasons for its existing decisions", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "featureful-migration-"));
    const file = path.join(dir, "post-cut.db");

    // A database at 0003 (Boundary notes cut), written with raw SQL so it doesn't depend on today's schema.
    const v2 = open(file);
    migrate(v2.db, { migrationsFolder: migrationsUpTo(POST_CUT_TAGS) });
    v2.sqlite.exec(`
      INSERT INTO people (id, name, role) VALUES
        (1, 'Alex', 'customer'), (2, 'Sam', 'pm'),
        (3, 'P3', 'customer'), (4, 'P4', 'customer'), (5, 'P5', 'customer'),
        (6, 'P6', 'customer'), (7, 'P7', 'customer');
      INSERT INTO problems (id, title, need, status, created_at) VALUES
        (1, 'Repeat a brew', 'I need to repeat a good brew.', 'open', 1),
        (2, 'Use it at night', 'I need a dark appearance.', 'open', 1),
        (3, 'Brew timer', 'I need to time my pours.', 'open', 1);
      -- Problem 1 has six supporters, Alex included: a high-Demand Problem.
      INSERT INTO supports (person_id, problem_id, created_at) VALUES
        (1, 1, 1), (3, 1, 1), (4, 1, 1), (5, 1, 1), (6, 1, 1), (7, 1, 1), (1, 2, 1), (1, 3, 1);
      INSERT INTO requests (id, problem_id, author_id, title, description, created_at) VALUES
        (1, 1, 1, 'Save recipes', 'Let me save a recipe.', 1),
        (2, 3, 1, 'Pour timer', 'Time my pours.', 2),
        (3, 2, 1, 'Dark theme', 'Too bright.', 3),
        (4, 3, 1, 'Bloom timer', 'Time the bloom.', 4),
        (5, 2, 1, 'Night mode', 'Dim it.', 5);
      INSERT INTO matching_decisions
        (id, request_id, proposed_problem_id, confidence, reason, proposed_title, proposed_need,
         submitter_choice, created_at, verdict, reviewer_id, reviewed_at, note)
      VALUES
        (1, 1, 1, 0.9, 'Same need', 'Repeat a brew', 'I need to.', 'accepted', 1, NULL, NULL, NULL, NULL),
        (2, 2, 1, 0.8, 'Looks close', 'Brew timer', 'I need to.', 'rejected', 2, NULL, NULL, NULL, NULL),
        (3, 3, 2, 0.6, 'Maybe', 'Dark', 'I need to.', 'accepted', 3, NULL, NULL, NULL, NULL),
        (4, 4, 1, 0.8, 'Looks close', 'Brew timer', 'I need to.', 'rejected', 4, 'confirm', 2, 5, 'Right'),
        (5, 5, 2, 0.95, 'Same need', 'Dark', 'I need to.', 'accepted', 5, NULL, NULL, NULL, NULL);
    `);
    v2.sqlite.close();

    // Today's migrations, then the backfill, as the app's db client opens it.
    const db = createDb(file);
    const decisions = () =>
      db.select().from(schema.matchingDecisions).orderBy(schema.matchingDecisions.id).all();

    expect(decisions().map((d) => d.escalationReasons)).toEqual([
      ["high_demand_merge"],
      ["mine_is_different"],
      ["low_confidence"],
      ["mine_is_different"], // reviewed decisions get reasons too, for the Matching example rule
      [], // decision 5 is outside the spot-check sample
    ]);
    expect(decisions()[0]).toMatchObject({
      matcherOutcome: "ok",
      closestProblemId: null,
      closestConfidence: null,
      regressionCase: false,
      verdict: null,
      reason: "Same need",
    });
    expect(decisions()[3]).toMatchObject({ verdict: "confirm", note: "Right" });
    expect(db.select().from(schema.supports).all()).toHaveLength(8);

    // Running it again (every startup) changes nothing.
    const before = decisions();
    const again = createDb(file);
    expect(again.select().from(schema.matchingDecisions).orderBy(schema.matchingDecisions.id).all()).toEqual(before);

    // Deleting a decision's closest Problem clears the link rather than blocking the delete.
    db.update(schema.matchingDecisions)
      .set({ closestProblemId: 3, closestConfidence: 0.5 })
      .where(eq(schema.matchingDecisions.id, 1))
      .run();
    db.delete(schema.problems).where(eq(schema.problems.id, 3)).run();
    expect(decisions()[0]).toMatchObject({ closestProblemId: null, closestConfidence: 0.5 });

    db.$client.close();
    again.$client.close();
  });
});

/**
 * Status changes: `changeStatus` saves the Status and Decision note together and records when the
 * Problem first left Open. No AI calls.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db";
import { problems } from "@/db/schema";
import { changeStatus } from "@/lib/decision-note";

let db: Db;
let problemId: number;
beforeEach(() => {
  db = createDb(":memory:");
  problemId = db.insert(problems).values({ title: "Compare roasts", need: "I need to compare roasts." }).returning().get().id;
});
const problem = () => db.select().from(problems).where(eq(problems.id, problemId)).get()!;

const FIRST = new Date("2026-11-10T09:00:00.000Z");
const LATER = new Date("2026-11-18T09:00:00.000Z");

describe("changeStatus", () => {
  it("records the first non-Open Status's time with the Status and Decision note", () => {
    expect(changeStatus(db, problemId, { status: "planned", note: "We're on it." }, FIRST)).toBe(true);
    expect(problem()).toMatchObject({ status: "planned", decisionNote: "We're on it.", firstDecidedAt: FIRST });
  });

  it("never overwrites it: a later change, even back to Open and out again, keeps the first time", () => {
    changeStatus(db, problemId, { status: "planned", note: "We're on it." }, FIRST);
    changeStatus(db, problemId, { status: "shipped", note: "Done." }, LATER);
    expect(problem()).toMatchObject({ status: "shipped", firstDecidedAt: FIRST });
    changeStatus(db, problemId, { status: "open", note: "Reopened." }, LATER);
    changeStatus(db, problemId, { status: "declined", note: "Not now." }, LATER);
    expect(problem()).toMatchObject({ status: "declined", firstDecidedAt: FIRST });
  });

  it("leaves it empty while the Problem stays Open", () => {
    changeStatus(db, problemId, { status: "open", note: "Still looking." }, FIRST);
    expect(problem().firstDecidedAt).toBeNull();
  });

  it("leaves it unknown for a Problem already decided before the field existed", () => {
    db.update(problems).set({ status: "planned" }).where(eq(problems.id, problemId)).run();
    changeStatus(db, problemId, { status: "shipped", note: "Done." }, LATER);
    expect(problem()).toMatchObject({ status: "shipped", firstDecidedAt: null });
  });

  it("is false for a missing Problem", () => {
    expect(changeStatus(db, 999, { status: "planned", note: "x" }, FIRST)).toBe(false);
  });
});

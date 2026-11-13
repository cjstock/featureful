import { describe, expect, it } from "vitest";
import { createDb } from "@/db";
import { people, problems, supports } from "@/db/schema";

describe("createDb", () => {
  it("gives an in-memory database with the schema applied and no data", () => {
    const db = createDb(":memory:");
    expect(db.select().from(problems).all()).toEqual([]);
  });

  it("lets a person support a Problem only once", () => {
    const db = createDb(":memory:");
    const [pat] = db
      .insert(people)
      .values({ name: "Pat", role: "customer" })
      .returning()
      .all();
    const [problem] = db
      .insert(problems)
      .values({ title: "Repeat a brew", need: "I need to repeat a good brew." })
      .returning()
      .all();

    db.insert(supports).values({ personId: pat.id, problemId: problem.id }).run();
    expect(() =>
      db.insert(supports).values({ personId: pat.id, problemId: problem.id }).run(),
    ).toThrow();
  });
});

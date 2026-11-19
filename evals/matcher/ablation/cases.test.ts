import { describe, expect, it } from "vitest";
import { ABLATION_BOUNDARY_CASES, ABLATION_PROBLEMS, ABLATION_REVIEWS, armCases, armState } from "./cases";

const notes = { 2: "Includes target profiles.", 3: "Includes backups." };

describe("the ablation arms", () => {
  it("(a) shows neither Boundary notes nor Matching examples", () => {
    const { problems, examples } = armState("a", notes);
    expect(problems.every((p) => p.boundaryNote === null)).toBe(true);
    expect(examples).toEqual([]);
  });

  it("(b) shows every review as a Matching example, most recent first, but no notes", () => {
    const { problems, examples } = armState("b", notes);
    expect(problems.every((p) => p.boundaryNote === null)).toBe(true);
    expect(examples.map((e) => e.request.title)).toEqual(ABLATION_REVIEWS.map((r) => r.request.title).reverse());
  });

  it("(c) shows the examples and each Problem's note", () => {
    const { problems, examples } = armState("c", notes);
    expect(examples).toHaveLength(ABLATION_REVIEWS.length);
    expect(problems.find((p) => p.id === 2)?.boundaryNote).toBe("Includes target profiles.");
    expect(problems.find((p) => p.id === 1)?.boundaryNote).toBeNull();
  });

  it("(a) judges only the boundary cases; (b) and (c) add the golden cases for the regression veto", () => {
    expect(armCases("a").every((c) => c.kind === "boundary")).toBe(true);
    expect(armCases("b").filter((c) => c.kind === "golden").length).toBeGreaterThan(0);
  });
});

describe("the ablation cases", () => {
  it("are 8 to 10 boundary cases, each expecting a Problem on the list", () => {
    expect(ABLATION_BOUNDARY_CASES.length).toBeGreaterThanOrEqual(8);
    expect(ABLATION_BOUNDARY_CASES.length).toBeLessThanOrEqual(10);
    const ids = new Set(ABLATION_PROBLEMS.map((p) => p.id));
    for (const c of armCases("c")) expect(c.expected === "new" || ids.has(c.expected)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { ABLATION_BOUNDARY_CASES, ABLATION_PROBLEMS, ABLATION_REVIEWS, ablationMatchingExamples, armCases } from "./cases";

describe("the ablation set (the record behind ADR 0003)", () => {
  it("shows every review as a Matching example, most recent first", () => {
    expect(ablationMatchingExamples().map((e) => e.request.title)).toEqual(
      ABLATION_REVIEWS.map((r) => r.request.title).reverse(),
    );
  });

  it("(a) judged only the boundary cases; (b) and (c) added the golden cases for the regression veto", () => {
    expect(armCases("a").every((c) => c.kind === "boundary")).toBe(true);
    expect(armCases("b").filter((c) => c.kind === "golden").length).toBeGreaterThan(0);
  });

  it("has 8 to 10 boundary cases, each expecting a Problem on the list", () => {
    expect(ABLATION_BOUNDARY_CASES.length).toBeGreaterThanOrEqual(8);
    expect(ABLATION_BOUNDARY_CASES.length).toBeLessThanOrEqual(10);
    const ids = new Set(ABLATION_PROBLEMS.map((p) => p.id));
    for (const c of armCases("c")) expect(c.expected === "new" || ids.has(c.expected)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { parseRegressionCases } from "./cases";

const valid = {
  id: "regression-1",
  kind: "regression",
  must: true,
  source: "Match review #12",
  problems: [{ id: 1, title: "Export roasts", need: "I need my roast logs out.", boundaryNote: null }],
  request: { title: "CSV please", description: "All my roasts as CSV." },
  expected: 1,
};

describe("parseRegressionCases", () => {
  it("accepts well-formed regression cases", () => {
    expect(parseRegressionCases([valid, { ...valid, id: "regression-2", expected: "new" }])).toHaveLength(2);
  });

  it("rejects a malformed entry, naming what is wrong", () => {
    expect(() => parseRegressionCases([{ ...valid, expected: "maybe" }])).toThrow(/regression\.json/);
    expect(() => parseRegressionCases([{ ...valid, kind: "golden" }])).toThrow(/regression\.json/);
    expect(() => parseRegressionCases([{ ...valid, request: undefined }])).toThrow(/regression\.json/);
  });
});

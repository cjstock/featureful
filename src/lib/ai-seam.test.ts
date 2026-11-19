/**
 * The AI call seam is enforced by ESLint: only src/lib/ai.ts may import the AI SDK, so no AI call
 * can skip aiGenerate's record and meter. aiGenerate's own test may use the SDK's mock model.
 */
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();

async function restrictedImports(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports").length;
}

describe("the AI call seam lint rule", () => {
  it.each([
    ['import { generateText } from "ai";', "src/lib/evaluator.ts"],
    ['import { anthropic } from "@ai-sdk/anthropic";', "src/app/actions/brief.ts"],
    ['import { MockLanguageModelV4 } from "ai/test";', "src/lib/intake/intake.test.ts"],
    ['export { generateText } from "ai";', "scripts/eval.ts"],
    ['import { generateText } from "ai";', "src/lib/ai.test.ts"],
    ['import { anthropic } from "@ai-sdk/anthropic";', "evals/harness/run.ts"],
  ])("blocks %s in %s", async (code, file) => {
    expect(await restrictedImports(code, file)).toBe(1);
  });

  it.each([
    ['import { generateText } from "ai";\nimport { anthropic } from "@ai-sdk/anthropic";', "src/lib/ai.ts", 0],
    ['import { MockLanguageModelV4 } from "ai/test";', "src/lib/ai.test.ts", 0],
  ])("allows %s in %s", async (code, file, expected) => {
    expect(await restrictedImports(code, file)).toBe(expected);
  });
}, 30_000);

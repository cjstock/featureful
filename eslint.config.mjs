import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const AI_SEAM_MESSAGE =
  "Only src/lib/ai.ts may import the AI SDK: make AI calls through aiGenerate so every one is recorded and metered.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The one AI call seam: nothing but src/lib/ai.ts imports `ai` or `@ai-sdk/*`.
  {
    ignores: ["src/lib/ai.ts", "src/lib/ai.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "ai", message: AI_SEAM_MESSAGE }],
          patterns: [{ group: ["ai/*", "@ai-sdk/*"], message: AI_SEAM_MESSAGE }],
        },
      ],
    },
  },
  // aiGenerate's own test may use the SDK's mock model, and nothing else from it.
  {
    files: ["src/lib/ai.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "ai", message: AI_SEAM_MESSAGE }],
          patterns: [{ group: ["ai/*", "!ai/test", "@ai-sdk/*"], message: AI_SEAM_MESSAGE }],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

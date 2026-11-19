/**
 * Retired AI modules (ADR 0003: the Boundary-note writer) make no new AI calls, but the AI call
 * records they made still read. The type checks below run under `npm run typecheck`.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { AI_MODULES, RETIRED_AI_MODULES, type CallableAiModule } from "@/db/schema";
import type { AiGenerateParams } from "@/lib/ai";
import { AI_MODULE_LABELS } from "@/lib/ai-calls";
import { AI_MAX_OUTPUT_TOKENS } from "@/lib/config";
import type { z } from "zod";

type ModuleParam = AiGenerateParams<z.ZodType>["module"];

describe("retired AI modules", () => {
  it("aiGenerate does not accept a retired module", () => {
    // @ts-expect-error: boundary_note is retired (ADR 0003), so no new AI call can name it.
    const retired: ModuleParam = "boundary_note";
    const live: ModuleParam = "matcher";
    expect([retired, live]).toHaveLength(2);
    expectTypeOf<ModuleParam>().toEqualTypeOf<CallableAiModule>();
    expectTypeOf<"boundary_note">().not.toExtend<ModuleParam>();
  });

  it("have no output cap, since they make no calls", () => {
    expect(Object.keys(AI_MAX_OUTPUT_TOKENS)).not.toContain("boundary_note");
  });

  it("stay readable: still an AI module, with a label for old AI call records", () => {
    expect(RETIRED_AI_MODULES).toEqual(["boundary_note"]);
    expect(AI_MODULES).toContain("boundary_note");
    expect(AI_MODULE_LABELS.boundary_note).toBe("Boundary note writer");
  });
});

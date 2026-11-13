import { anthropic } from "@ai-sdk/anthropic";
import { CLAUDE_MODEL } from "./config";

/**
 * The language model for every AI call. The provider reads
 * ANTHROPIC_API_KEY from the environment (.env).
 */
export const model = anthropic(CLAUDE_MODEL);

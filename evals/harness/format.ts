import type { CaseAnswer } from "./types";

/** A case answer as people read it: "Problem #3" or "new Problem". */
export const formatAnswer = (answer: CaseAnswer) => (answer === "new" ? "new Problem" : `Problem #${answer}`);

/**
 * Harness validation: the known-correct answer passes, doing nothing fails.
 * Offline: both Matchers are fakes, so no AI call is made.
 */
import { describe, expect, it } from "vitest";
import type { Matcher } from "@/lib/intake";
import { SEED_REQUESTS } from "../../scripts/seed-data";
import { CASES } from "../matcher/cases";
import { gate } from "./gate";
import { runEval } from "./run";
import type { EvalResult } from "./types";

/** Answers every case and seed Request correctly, using the answer keys the harness scores against. */
const oracleMatcher: Matcher = async (request, problems) => {
  const fixed = CASES.find((c) => c.request.title === request.title && c.request.description === request.description);
  if (fixed) {
    return fixed.expected === "new"
      ? { match: null, newProblem: { title: "oracle", need: "oracle" } }
      : { match: { problemId: fixed.expected, confidence: 1, reason: "oracle" }, newProblem: { title: "oracle", need: "oracle" } };
  }
  const group = SEED_REQUESTS.find((r) => r.title === request.title)!.group;
  const newProblem = { title: `group:${group}`, need: `The need behind ${group}.` };
  const existing = problems.find((p) => p.title === newProblem.title);
  return existing
    ? { match: { problemId: existing.id, confidence: 1, reason: "oracle" }, newProblem }
    : { match: null, newProblem };
};

/** Does nothing useful: every Request becomes a new Problem. */
const nullMatcher: Matcher = async (request) => ({
  match: null,
  newProblem: { title: request.title, need: request.description },
});

const asResult = (run: Awaited<ReturnType<typeof runEval>>): EvalResult => ({
  ...run,
  commit: "test",
  date: "2026-11-18T00:00:00.000Z",
  model: "fake",
  calls: 0,
  costUsd: 0,
});

describe("harness validation", () => {
  it("scores the oracle Matcher 100% and passes the gate", async () => {
    const run = asResult(await runEval(oracleMatcher, CASES));

    expect(run.replay).toMatchObject({ precision: 1, recall: 1, f1: 1, problemsCreated: 16, expectedProblems: 16 });
    expect(run.caseScores).toEqual({ accuracy: 1, matchVsNewAccuracy: 1, correctProblemAccuracy: 1 });
    expect(run.cases.every((c) => c.passed)).toBe(true);
    expect(gate(run, null).passed).toBe(true);
    expect(gate(run, run).passed).toBe(true);
  });

  it("fails the null 'always new' Matcher, with or without a baseline", async () => {
    const oracle = asResult(await runEval(oracleMatcher, CASES));
    const run = asResult(await runEval(nullMatcher, CASES));

    expect(run.replay).toMatchObject({ recall: 0, f1: 0, problemsCreated: SEED_REQUESTS.length });
    expect(gate(run, null).passed).toBe(false);
    const verdict = gate(run, oracle);
    expect(verdict.passed).toBe(false);
    expect(verdict.breaches).toContainEqual(expect.stringContaining("F1"));
  });

  it("asks the Matcher once per seed Request and once per case, and nothing else", async () => {
    let calls = 0;
    await runEval(async (...args) => {
      calls++;
      return nullMatcher(...args);
    }, CASES);
    expect(calls).toBe(SEED_REQUESTS.length + CASES.length);
  });

  it("keeps the Matcher's reason for a new-Problem answer, so flips to new can be explained", async () => {
    const run = await runEval(
      async () => ({
        match: null,
        reason: "Grind advice for a new bean is a different need.",
        newProblem: { title: "Starting grind for a new bean", need: "I need a place to start." },
      }),
      CASES.slice(0, 1),
    );
    expect(run.cases[0].reason).toBe(
      "Grind advice for a new bean is a different need. (New Problem: Starting grind for a new bean)",
    );
  });
});

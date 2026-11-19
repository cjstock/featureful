/**
 * Matcher eval: replays the seed Requests through intake and runs the fixed-state
 * cases in evals/matcher/, then the Evaluator injection check (evals/evaluator/),
 * scores them, gates against evals/baseline.json and prints a report (also
 * appended to $GITHUB_STEP_SUMMARY in CI).
 *
 *   npm run eval                       # live: calls the Anthropic API (~40 Matcher calls, 2 Evaluator calls)
 *   npm run eval -- --estimate         # offline: estimate the live run's cost, no AI calls
 *   npm run eval -- --write-baseline   # live, then write evals/baseline.json (explicit only)
 *
 * Only the Matcher and, for the injection check, the Evaluator run: no writers.
 * Every call goes through `aiGenerate` with source "eval", and its AI call record
 * goes to the run's own in-memory database (never data/). Every run first
 * estimates its worst-case cost offline (each call's prompt plus a full answer at
 * the module's output cap) and refuses to start if that could pass the per-run
 * cap (60 AI calls or $1). During the run each call's output is capped (config:
 * 1,000 tokens for the Matcher, 1,500 for the Evaluator), and the meter refuses
 * any call whose worst case would pass the cap. Never part of `npm test`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createDb } from "@/db";
import { type AiCaller, offlineModel } from "@/lib/ai";
import { AI_MAX_OUTPUT_TOKENS, CLAUDE_MODEL, MODEL_PRICES } from "@/lib/config";
import { createLlmMatcher } from "@/lib/intake/llm-matcher";
import { gate } from "../evals/harness/gate";
import { evalEvaluator, runInjectionCheck } from "../evals/harness/injection";
import {
  CapReachedError,
  createMeter,
  ESTIMATE_ANSWER,
  ESTIMATE_EVALUATION,
  EVAL_CAP,
  worstCaseMeter,
  type Meter,
} from "../evals/harness/meter";
import { costLine, formatReport } from "../evals/harness/report";
import { runEval } from "../evals/harness/run";
import type { EvalResult } from "../evals/harness/types";
import { CASES } from "../evals/matcher/cases";

const BASELINE_PATH = path.join(process.cwd(), "evals", "baseline.json");

const args = process.argv.slice(2);
const estimateOnly = args.includes("--estimate");
const writeBaseline = args.includes("--write-baseline");

function fail(message: string): never {
  console.error(`\nEval failed: ${message}`);
  process.exit(1);
}

function currentCommit(): string {
  if (process.env.EVAL_COMMIT) return process.env.EVAL_COMMIT.slice(0, 12);
  const attempts: [string, string[]][] = [
    ["git", ["rev-parse", "--short=12", "HEAD"]],
    // A secondary jj workspace has no .git; its working copy's parent is the last described commit.
    ["jj", ["log", "-r", "@-", "--no-graph", "-T", "commit_id.short(12)"]],
  ];
  for (const [command, commandArgs] of attempts) {
    try {
      return execFileSync(command, commandArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      // Try the next one.
    }
  }
  return "unknown";
}

/** Print to stdout and, in CI, append to the job summary. */
function publish(text: string) {
  console.log(`\n${text}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

/**
 * Run the whole eval offline, with the offline model's stand-in answer for every
 * call, adding up each call's worst case under the same meter rule the live run
 * uses. Throws `CapReachedError` if the live run could pass the cap.
 */
async function estimate() {
  const meter = createMeter(EVAL_CAP);
  const db = createDb(":memory:");
  const caller = (answer: string): AiCaller => ({
    source: "eval",
    person: null,
    model: offlineModel(answer),
    meter: worstCaseMeter(meter),
  });
  await runEval(createLlmMatcher(db, caller(ESTIMATE_ANSWER)), CASES, db);
  await runInjectionCheck(evalEvaluator(db, caller(ESTIMATE_EVALUATION)));
  return meter.totals();
}

/**
 * The live run: the real model, metered against the cap, with AI call records in its own
 * in-memory db. The Matcher runs first, then the injection check, whose calls and cost are
 * kept apart too (the gate compares cost like for like against a baseline without the check).
 */
async function liveRun(meter: Meter) {
  const db = createDb(":memory:");
  const caller: AiCaller = { source: "eval", person: null, meter };
  const matcherRun = await runEval(createLlmMatcher(db, caller), CASES, db);
  const before = meter.totals();
  const injection = await runInjectionCheck(evalEvaluator(db, caller));
  const after = meter.totals();
  return {
    ...matcherRun,
    injection: { ...injection, calls: after.calls - before.calls, costUsd: after.costUsd - before.costUsd },
  };
}

async function main() {
  const prices = MODEL_PRICES[CLAUDE_MODEL] ?? fail(`no prices for ${CLAUDE_MODEL} in src/lib/config.ts.`);
  const baseline: EvalResult | null = fs.existsSync(BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"))
    : null;
  if (!baseline && !estimateOnly && !writeBaseline) {
    fail("evals/baseline.json doesn't exist. Run `npm run eval -- --write-baseline` to record the first one.");
  }

  let estimated;
  try {
    estimated = await estimate();
  } catch (error) {
    if (!(error instanceof CapReachedError)) throw error;
    fail(`the worst-case estimate is over the per-run cap. ${error.message}`);
  }
  console.log(
    `Estimate (worst case): $${estimated.costUsd.toFixed(4)} for ${estimated.calls} AI calls ` +
      `(prompt chars ÷ 4 at $${prices.input}/MTok in; ${AI_MAX_OUTPUT_TOKENS.matcher} output tokens per Matcher call and ` +
      `${AI_MAX_OUTPUT_TOKENS.evaluator} per Evaluator call at $${prices.output}/MTok).`,
  );
  if (estimateOnly) return;

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    fail("ANTHROPIC_API_KEY is not set. Put it in .env (see .env.example), or use --estimate.");
  }

  const meter = createMeter(EVAL_CAP);

  console.log(`Running the seed replay, ${CASES.length} cases and the Evaluator injection check on ${CLAUDE_MODEL}...`);
  let run;
  try {
    run = await liveRun(meter);
  } catch (error) {
    console.error(error);
    const why = error instanceof CapReachedError ? error.message : "An AI call or the harness threw (see the job log).";
    publish(
      `## Matcher eval\n\nGate: **FAIL**: the run stopped before it finished (not retried). ${why}\n\n` +
        costLine(meter.totals(), EVAL_CAP),
    );
    fail("the run stopped before it finished (not retried).");
  }

  const totals = meter.totals();
  const result: EvalResult = {
    commit: currentCommit(),
    date: new Date().toISOString(),
    model: CLAUDE_MODEL,
    ...run,
    calls: totals.calls,
    costUsd: totals.costUsd,
  };
  const verdict = gate(result, baseline);
  const report = `${formatReport(result, baseline, verdict)}\n\n${costLine(totals, EVAL_CAP)}\n`;

  publish(report);

  if (writeBaseline) {
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`Wrote ${path.relative(process.cwd(), BASELINE_PATH)}.`);
  }
  if (!verdict.passed) fail("the gate blocked this run (see the breaches above).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

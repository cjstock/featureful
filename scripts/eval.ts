/**
 * Matcher eval: replays the seed Requests through intake and runs the fixed-state
 * cases in evals/matcher/, scores them, gates against evals/baseline.json and
 * prints a report (also appended to $GITHUB_STEP_SUMMARY in CI).
 *
 *   npm run eval                       # live: calls the Anthropic API (~40 Matcher calls)
 *   npm run eval -- --estimate         # offline: estimate the live run's cost, no AI calls
 *   npm run eval -- --write-baseline   # live, then write evals/baseline.json (explicit only)
 *   npm run eval -- --ablation         # live: the Boundary-notes ablation (3 arms × 2 runs, 60 Matcher calls)
 *   npm run eval -- --ablation --estimate
 *   npm run eval -- --ablation-notes   # live, once: write the ablation's Boundary notes with the real writer
 *
 * Only the Matcher runs: no Evaluator, no writers. Every run first estimates its
 * worst-case cost offline (each call's prompt plus a full 1,000-token answer) and
 * refuses to start if that could pass the per-run cap (60 AI calls or $1). During
 * the run each call's output is capped at 1,000 tokens, and the meter refuses any
 * call whose worst case would pass the cap. Never part of `npm test`.
 *
 * The ablation (build ticket 06) runs evals/matcher/ablation/ instead: no replay,
 * no gate, no baseline. It writes evals/matcher/ablation/result.json and prints
 * the keep-or-cut decision by rule (`decideBoundaryNotes`).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { llmBoundaryNoteWriter } from "@/lib/boundary-note-writer";
import { CLAUDE_MODEL, MODEL_PRICES, type ModelPrices } from "@/lib/config";
import { llmMatcher } from "@/lib/intake/llm-matcher";
import {
  type ArmRun,
  costPerRequest,
  decideBoundaryNotes,
  formatAblationReport,
  summarizeAblation,
} from "../evals/harness/ablation";
import { distilAblationNotes, runAblation } from "../evals/harness/ablation-run";
import { gate } from "../evals/harness/gate";
import {
  cannedNewProblem,
  type GenerateResult,
  interceptModel,
  meteredCalls,
  promptChars,
} from "../evals/harness/intercept";
import {
  CapReachedError,
  createMeter,
  EVAL_CAP,
  MATCHER_MAX_OUTPUT_TOKENS,
  worstCaseCallCost,
} from "../evals/harness/meter";
import { costLine, formatReport } from "../evals/harness/report";
import { runEval } from "../evals/harness/run";
import type { EvalResult } from "../evals/harness/types";
import { ABLATION_BOUNDARY_CASES, ABLATION_GOLDEN_CASES, ABLATION_REVIEWS } from "../evals/matcher/ablation/cases";
import { CASES } from "../evals/matcher/cases";

const BASELINE_PATH = path.join(process.cwd(), "evals", "baseline.json");
const ABLATION_DIR = path.join(process.cwd(), "evals", "matcher", "ablation");
const NOTES_PATH = path.join(ABLATION_DIR, "boundary-notes.json");
const ABLATION_RESULT_PATH = path.join(ABLATION_DIR, "result.json");

const args = process.argv.slice(2);
const estimateOnly = args.includes("--estimate");
const writeBaseline = args.includes("--write-baseline");
const ablation = args.includes("--ablation");
const ablationNotes = args.includes("--ablation-notes");

type Totals = { calls: number; costUsd: number };

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

function requireApiKey() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    fail("ANTHROPIC_API_KEY is not set. Put it in .env (see .env.example), or use --estimate.");
  }
}

/**
 * Run `work` offline, with a stand-in answer for every call, adding up each
 * call's worst case under the same meter rule the live run uses. Throws
 * `CapReachedError` if the live run could pass the cap.
 */
async function estimate(
  prices: ModelPrices,
  work: (totals: () => Totals) => Promise<unknown>,
  canned: () => GenerateResult,
): Promise<Totals> {
  const meter = createMeter(EVAL_CAP);
  const restore = interceptModel(async (options) => {
    const worstCase = worstCaseCallCost(promptChars(options), prices);
    meter.beforeCall(worstCase);
    meter.afterCall(worstCase);
    return canned();
  });
  try {
    await work(meter.totals);
  } finally {
    restore();
  }
  return meter.totals();
}

/** Estimate `work`'s worst case and print it first; exit if it could pass the cap. */
async function estimateOrFail(
  prices: ModelPrices,
  work: (totals: () => Totals) => Promise<unknown>,
  canned: () => GenerateResult = cannedNewProblem,
) {
  let estimated: Totals;
  try {
    estimated = await estimate(prices, work, canned);
  } catch (error) {
    if (!(error instanceof CapReachedError)) throw error;
    fail(`the worst-case estimate is over the per-run cap. ${error.message}`);
  }
  console.log(
    `Estimate (worst case): $${estimated.costUsd.toFixed(4)} for ${estimated.calls} AI calls ` +
      `(prompt chars ÷ 4 at $${prices.input}/MTok in, ${MATCHER_MAX_OUTPUT_TOKENS} output tokens per call at $${prices.output}/MTok).`,
  );
}

/** The Boundary-note writer's structured output, as a stand-in for offline estimates. */
function cannedBoundaryNote(): GenerateResult {
  return {
    ...cannedNewProblem(),
    content: [{ type: "text", text: JSON.stringify({ boundaryNote: "Offline estimate: no AI call was made." }) }],
  };
}

/** evals/matcher/ablation/boundary-notes.json: the notes the real writer wrote, once, and what that cost. */
type NotesFixture = { commit: string; date: string; model: string; calls: number; costUsd: number; notes: Record<string, string> };

/** Write the ablation's Boundary notes once, with the real writer, as a fixture to commit. */
async function writeAblationNotes(prices: ModelPrices) {
  await estimateOrFail(prices, () => distilAblationNotes(ABLATION_REVIEWS, llmBoundaryNoteWriter), cannedBoundaryNote);
  if (estimateOnly) return;
  requireApiKey();

  const meter = createMeter(EVAL_CAP);
  const restore = interceptModel(meteredCalls(meter, prices));
  const notes = await distilAblationNotes(ABLATION_REVIEWS, llmBoundaryNoteWriter).finally(restore);
  const totals = meter.totals();
  const fixture: NotesFixture = { commit: currentCommit(), date: new Date().toISOString(), model: CLAUDE_MODEL, ...totals, notes };
  fs.writeFileSync(NOTES_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`\n${JSON.stringify(notes, null, 2)}\n\nWrote ${path.relative(process.cwd(), NOTES_PATH)}.`);
  console.log(costLine(totals, EVAL_CAP));
}

/** The Boundary-notes ablation: three arms, twice each, then the keep-or-cut decision by rule. */
async function runAblationEval(prices: ModelPrices) {
  if (!fs.existsSync(NOTES_PATH)) {
    fail("evals/matcher/ablation/boundary-notes.json doesn't exist. Run `npm run eval -- --ablation-notes` once first.");
  }
  const fixture: NotesFixture = JSON.parse(fs.readFileSync(NOTES_PATH, "utf8"));
  const notes = Object.fromEntries(Object.entries(fixture.notes).map(([id, note]) => [Number(id), note]));

  await estimateOrFail(prices, (totals) => runAblation(llmMatcher, notes, totals));
  if (estimateOnly) return;
  requireApiKey();

  const meter = createMeter(EVAL_CAP);
  interceptModel(meteredCalls(meter, prices));
  console.log(
    `Running the ablation: ${ABLATION_BOUNDARY_CASES.length} boundary + ${ABLATION_GOLDEN_CASES.length} golden cases, ` +
      `3 arms × 2 runs, on ${CLAUDE_MODEL}...`,
  );
  let runs: ArmRun[];
  try {
    runs = await runAblation(llmMatcher, notes, meter.totals);
  } catch (error) {
    console.error(error);
    publish(
      `## Boundary-notes ablation\n\nThe run stopped before it finished (not retried).\n\n${costLine(meter.totals(), EVAL_CAP)}`,
    );
    fail("the ablation stopped before it finished (not retried).");
  }

  const totals = meter.totals();
  const counted = { runs, boundaryCases: ABLATION_BOUNDARY_CASES.length, goldenCases: ABLATION_GOLDEN_CASES.length };
  const result = {
    commit: currentCommit(),
    date: new Date().toISOString(),
    model: CLAUDE_MODEL,
    notesFixture: { commit: fixture.commit, date: fixture.date, calls: fixture.calls, costUsd: fixture.costUsd },
    boundaryCases: counted.boundaryCases,
    goldenCases: counted.goldenCases,
    summary: summarizeAblation(counted),
    costPerRequest: costPerRequest(counted),
    decision: decideBoundaryNotes(counted),
    calls: totals.calls,
    costUsd: totals.costUsd,
    runs,
  };
  fs.writeFileSync(ABLATION_RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  publish(`${formatAblationReport(counted)}\n\n${costLine(totals, EVAL_CAP)}\n`);
  console.log(`Wrote ${path.relative(process.cwd(), ABLATION_RESULT_PATH)}.`);
}

async function main() {
  const prices = MODEL_PRICES[CLAUDE_MODEL] ?? fail(`no prices for ${CLAUDE_MODEL} in src/lib/config.ts.`);
  if (ablationNotes) return writeAblationNotes(prices);
  if (ablation) return runAblationEval(prices);

  const baseline: EvalResult | null = fs.existsSync(BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"))
    : null;
  if (!baseline && !estimateOnly && !writeBaseline) {
    fail("evals/baseline.json doesn't exist. Run `npm run eval -- --write-baseline` to record the first one.");
  }

  await estimateOrFail(prices, () => runEval(llmMatcher, CASES));
  if (estimateOnly) return;
  requireApiKey();

  const meter = createMeter(EVAL_CAP);
  interceptModel(meteredCalls(meter, prices));

  console.log(`Running ${CASES.length} cases and the seed replay on ${CLAUDE_MODEL}...`);
  let run;
  try {
    run = await runEval(llmMatcher, CASES);
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

/**
 * Seed a realistic coffee-app demo: wipes the database, creates people and the Product
 * Strategy, submits every Request in seed-data.ts through the real Intake pipeline
 * (auto-accepting the Matcher's proposal), adds extra Support, then evaluates every Problem.
 *
 *   npm run seed                 # real run: calls the Anthropic API (~45 calls)
 *   npm run seed -- --dry-run    # offline: fake Matcher, no evaluation, in-memory db
 *
 * Flags: --dry-run, --db=<path> (default DATABASE_PATH, or :memory: for a dry run),
 *        --max-ai-calls=<n> (default 60; the seed aborts rather than exceed it).
 * Runs sequentially and never retries a failed call itself.
 */
import fs from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { createDb, DATABASE_PATH, type Db } from "@/db";
import { matchingDecisions, people, problems, productStrategy, requests, supports } from "@/db/schema";
import { createIntake, type Matcher } from "@/lib/intake";
import { llmMatcher } from "@/lib/intake/llm-matcher";
import { evaluateProblem } from "@/lib/evaluator";
import { DEFAULT_PRODUCT_STRATEGY, saveProductStrategy } from "@/lib/product-strategy";
import { SEED_EXTRA_SUPPORT, SEED_PEOPLE, SEED_REQUESTS } from "./seed-data";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const dryRun = args.includes("--dry-run");
const maxAiCalls = Number(flag("max-ai-calls") ?? 60);
const dbFile = flag("db") ?? (dryRun ? ":memory:" : DATABASE_PATH);

function fail(message: string): never {
  console.error(`\nSeed aborted: ${message}`);
  process.exit(1);
}

let aiCalls = 0;
/** Count one AI call, refusing to go over the cap. */
function spendAiCall(what: string) {
  if (aiCalls >= maxAiCalls) fail(`AI call cap of ${maxAiCalls} reached before ${what}.`);
  aiCalls++;
}

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** Wipe every table and restart ids at 1. */
function reset(db: Db) {
  db.transaction((tx) => {
    tx.delete(matchingDecisions).run();
    tx.delete(supports).run();
    tx.delete(requests).run();
    tx.delete(problems).run();
    tx.delete(productStrategy).run();
    tx.delete(people).run();
    tx.run(sql`DELETE FROM sqlite_sequence`);
  });
}

/** Offline stand-in for the LLM Matcher: matches on the seed's own `group` hint. */
function fakeMatcher(groupProblem: Map<string, number>): Matcher {
  return async (draft, list) => {
    const seed = SEED_REQUESTS.find((r) => r.title === draft.title);
    const problemId = seed && groupProblem.get(seed.group);
    const newProblem = { title: `Need behind: ${draft.title}`, need: `I need ${draft.title.toLowerCase()}.` };
    return problemId && list.some((p) => p.id === problemId)
      ? { match: { problemId, confidence: 0.9, reason: `fake: same group "${seed!.group}"` }, newProblem }
      : { match: null, newProblem };
  };
}

async function main() {
  if (!dryRun && !process.env.ANTHROPIC_API_KEY?.trim()) {
    fail("ANTHROPIC_API_KEY is not set. Put it in .env (see .env.example), or use --dry-run.");
  }
  if (!Number.isInteger(maxAiCalls) || maxAiCalls < 1) fail("--max-ai-calls must be a positive integer.");
  if (!dryRun && SEED_REQUESTS.length > maxAiCalls) {
    fail(`${SEED_REQUESTS.length} Requests need more AI calls than the cap of ${maxAiCalls}.`);
  }

  console.log(`Seeding ${dbFile}${dryRun ? " (dry run: fake Matcher, no evaluation)" : ""}`);
  if (dbFile !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });
  const db = createDb(dbFile);

  reset(db);
  db.insert(people).values(SEED_PEOPLE).run();
  const personId = new Map(db.select().from(people).all().map((p) => [p.name, p.id]));
  saveProductStrategy(db, DEFAULT_PRODUCT_STRATEGY);
  console.log(`Created ${personId.size} people and the Product Strategy.\n`);

  const groupProblem = new Map<string, number>();
  const matcher: Matcher = dryRun
    ? fakeMatcher(groupProblem)
    : (draft, list) => {
        spendAiCall(`matching "${draft.title}"`);
        return llmMatcher(draft, list);
      };
  const intake = createIntake({ db, matcher });

  const ordered = [...SEED_REQUESTS].sort((a, b) => b.daysAgo - a.daysAgo);
  const requestProblem = new Map<string, number>();
  for (const [i, seed] of ordered.entries()) {
    const authorId = personId.get(seed.author) ?? fail(`unknown author ${seed.author}`);
    const draft = { title: seed.title, description: seed.description };
    let proposal;
    try {
      proposal = await intake.propose(draft);
    } catch (error) {
      console.error(error);
      fail(`Matcher failed on "${seed.title}" (not retried).`);
    }
    const decision = proposal.match ? { attachTo: proposal.match.problemId } : { createProblem: proposal.newProblem };
    const { problemId, requestId, createdProblem } = intake.confirm(draft, proposal, decision, authorId);

    // Backdate so the demo has a history.
    const at = daysAgo(seed.daysAgo);
    db.update(requests).set({ createdAt: at }).where(eq(requests.id, requestId)).run();
    db.update(matchingDecisions).set({ createdAt: at }).where(eq(matchingDecisions.requestId, requestId)).run();
    db.update(supports)
      .set({ createdAt: at })
      .where(and(eq(supports.personId, authorId), eq(supports.problemId, problemId)))
      .run();
    if (createdProblem) db.update(problems).set({ createdAt: at }).where(eq(problems.id, problemId)).run();

    requestProblem.set(seed.key, problemId);
    if (!groupProblem.has(seed.group)) groupProblem.set(seed.group, problemId);

    const n = `[${String(i + 1).padStart(2)}/${ordered.length}]`;
    console.log(`${n} ${seed.author}: "${seed.title}"`);
    console.log(
      proposal.match
        ? `        -> matched Problem #${problemId} "${proposal.match.problemTitle}" (${proposal.match.confidence.toFixed(2)}): ${proposal.match.reason}`
        : `        -> new Problem #${problemId} "${proposal.newProblem.title}"`,
    );
  }

  console.log("\nExtra Support:");
  for (const { request, people: names } of SEED_EXTRA_SUPPORT) {
    const problemId = requestProblem.get(request) ?? fail(`unknown seed Request key ${request}`);
    for (const name of names) {
      const id = personId.get(name) ?? fail(`unknown person ${name}`);
      db.insert(supports).values({ personId: id, problemId }).onConflictDoNothing().run();
    }
    console.log(`  Problem #${problemId}: ${names.join(", ")}`);
  }

  const problemIds = db.select({ id: problems.id, title: problems.title }).from(problems).all();
  let failed = 0;
  if (dryRun) {
    console.log(`\nSkipping evaluation of ${problemIds.length} Problems (dry run).`);
  } else {
    if (aiCalls + problemIds.length > maxAiCalls) {
      fail(
        `evaluating ${problemIds.length} Problems would take ${aiCalls + problemIds.length} AI calls, over the cap of ${maxAiCalls}. ` +
          `Intake data is saved; evaluate later from the app (PM: Re-evaluate all).`,
      );
    }
    console.log(`\nEvaluating ${problemIds.length} Problems:`);
    for (const p of problemIds) {
      spendAiCall(`evaluating Problem #${p.id}`);
      try {
        const e = await evaluateProblem(db, p.id);
        console.log(
          `  #${p.id} ${p.title}: impact ${e.impact.score}, fit ${e.strategicFit.score}, effort ${e.effort.score}, risk ${e.risk.score}`,
        );
      } catch (error) {
        failed++;
        console.error(`  #${p.id} ${p.title}: evaluation failed (not retried)`, error);
      }
    }
  }

  const evidence = db.select({ problemId: requests.problemId }).from(requests).all();
  const multi = new Set(evidence.map((r) => r.problemId).filter((id, i, all) => all.indexOf(id) !== i)).size;
  console.log(
    `\nDone: ${evidence.length} Requests -> ${problemIds.length} Problems (${multi} with several pieces of Evidence). ` +
      `AI calls: ${aiCalls}/${maxAiCalls}${failed ? `, ${failed} evaluations failed` : ""}.`,
  );
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

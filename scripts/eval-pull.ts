/**
 * Export the Regression cases PMs marked in Match review into evals/matcher/regression.json,
 * built from each decision's AI call (the Problems the Matcher was shown). The app never writes
 * source files: a human runs this and commits the result in a reviewed (Yellow-lane) PR.
 *
 *   npm run eval:pull                     # reads $DATABASE_PATH (default data/featureful.db)
 *   npm run eval:pull -- --dry-run        # print what would be written, write nothing
 *   npm run eval:pull -- --out <file>     # write somewhere else
 *   npm run eval:pull -- --force          # replace existing cases whose content changed
 *
 * The database is opened read-only: nothing is migrated or written there, so it must already be
 * migrated (open the app once). Cases already in the file keep their order; new ones are
 * appended. An existing case pulled again with different content is kept and reported, unless
 * --force. No AI calls.
 */
import fs from "node:fs";
import path from "node:path";
import { DATABASE_PATH, openDbReadOnly } from "@/db";
import { mergeRegressionCases, pullRegressionCases } from "../evals/harness/pull";
import { parseRegressionCases } from "../evals/matcher/cases";

function fail(message: string): never {
  console.error(`eval:pull: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
let dryRun = false;
let force = false;
let outArg: string | undefined;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--dry-run") dryRun = true;
  else if (arg === "--force") force = true;
  else if (arg === "--out") {
    outArg = args[++i];
    if (outArg === undefined || outArg.startsWith("--")) fail("--out needs a file path.");
  } else fail(`unknown argument: ${arg}`);
}
const out = path.resolve(outArg ?? path.join("evals", "matcher", "regression.json"));

function main() {
  if (!fs.existsSync(DATABASE_PATH)) fail(`no database at ${DATABASE_PATH}. Set DATABASE_PATH or run the app first.`);
  let pulled;
  try {
    pulled = pullRegressionCases(openDbReadOnly(DATABASE_PATH));
  } catch (error) {
    fail(`couldn't read ${DATABASE_PATH} (is it migrated? open the app once): ${String(error)}`);
  }
  const existing = fs.existsSync(out) ? parseRegressionCases(JSON.parse(fs.readFileSync(out, "utf8"))) : [];
  const merged = mergeRegressionCases(existing, pulled.cases, { force });
  parseRegressionCases(merged.cases);

  for (const s of pulled.skipped) console.warn(`Skipped Matching decision #${s.decisionId}: ${s.why}.`);
  for (const id of merged.conflicts) {
    console.warn(`Kept ${id} as it is: the pulled case differs. Re-run with --force to replace it.`);
  }
  console.log(
    `Pulled ${pulled.cases.length} marked Regression case(s): ${merged.added.length} added, ` +
      `${merged.replaced.length} replaced, ${merged.conflicts.length} kept despite changes; ${merged.cases.length} in total.`,
  );
  const json = `${JSON.stringify(merged.cases, null, 2)}\n`;
  if (dryRun) {
    console.log(json);
    return;
  }
  fs.writeFileSync(out, json);
  console.log(`Wrote ${path.relative(process.cwd(), out)}. Review it and commit it in a PR.`);
}

main();

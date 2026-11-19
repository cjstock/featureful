/**
 * The Boundary-notes ablation set (build ticket 06), kept as the record of the
 * test behind ADR 0003. Nothing runs it any more: Boundary notes were cut, and
 * with them the ablation's runner and arm (c). The ADR says how to restore both.
 *
 * One fixed state, as in production: a Problem list and eight simulated PM
 * Match reviews. Each review draws a line between two Problems that the titles
 * don't make obvious, and becomes a Matching example. The Boundary notes in
 * boundary-notes.json were written once from the same reviews by the real
 * Boundary-note writer; result.json is the run that decided the cut.
 *
 * Each boundary case is a new Request on one review's line, worded differently
 * from the reviewed Request, so the examples or notes have to generalise. The
 * golden cases are clear-cut Requests on Problems the notes talked about, to
 * catch notes that push a plain match away.
 */
import type { MatchingExample, ProblemSummary } from "@/lib/intake";
import type { AblationArm } from "../../harness/ablation";
import type { MatcherCase } from "../../harness/types";

const SOURCE = "hand-written ablation case (build ticket 06)";

const problem = (id: number, title: string, need: string): ProblemSummary => ({ id, title, need });

export const ABLATION_PROBLEMS: ProblemSummary[] = [
  problem(
    1,
    "Stop re-typing roasts from my roasting software",
    "I need roast logs to come in from the software that recorded the roast, so I don't re-type temperatures and times by hand.",
  ),
  problem(
    2,
    "Roast against a profile I trust",
    "I need a target roast profile in front of me while I roast, so I can hit the same curve again and get a repeatable result.",
  ),
  problem(
    3,
    "Get my data out of the app",
    "I need to take my roast and brew data out of the app in a format other tools can read, so I can analyse it elsewhere and never lose it.",
  ),
  problem(
    4,
    "Keep my own copy of a recipe someone shared",
    "I need to keep a recipe someone shared with me as my own, so I can tweak it without changing theirs.",
  ),
  problem(
    5,
    "Start from the grind setting that worked",
    "I need the app to remember the grinder setting I used for each bean and method, so I start from the right setting instead of guessing.",
  ),
  problem(
    6,
    "Keep grind settings meaningful after servicing the grinder",
    "I need my saved grind settings to keep meaning the same grind after I clean the grinder or change burrs, so my notes stay useful.",
  ),
  problem(
    7,
    "Account for coffee that stays in the grinder",
    "I need to know how much coffee actually comes out of my grinder compared with what I put in, so my doses and ratios are accurate.",
  ),
  problem(
    8,
    "Know how much green coffee I have left",
    "I need my green bean stock to go down as I roast, so I know when to reorder before I run out.",
  ),
  problem(
    9,
    "Work out water for a brew ratio",
    "I need to know how much water to pour for my dose and ratio without doing the maths myself, so my brews stay consistent.",
  ),
  problem(
    10,
    "Know how much roasted coffee is left",
    "I need to see how much roasted coffee I have on the shelf, so I can plan my next roast before I run out.",
  ),
  problem(
    11,
    "Keep my other tools up to date as I log",
    "I need what I log here to show up in the other tools I use without exporting by hand, so they never fall behind.",
  ),
  problem(
    12,
    "Use the app comfortably at night",
    "I need a dark appearance, so the app doesn't glare when I log brews in a dim kitchen.",
  ),
];

const byId = new Map(ABLATION_PROBLEMS.map((p) => [p.id, p]));
const ref = (id: number) => ({ id, title: byId.get(id)!.title });

/** A simulated PM Match review on an earlier Request. `from` is null when that Problem was deleted by the Move. */
export type SimulatedReview = {
  request: { title: string; description: string };
  proposal: MatchingExample["proposal"];
  submitterChoice: MatchingExample["submitterChoice"];
  verdict: "move" | "split";
  from: number | null;
  to: number;
  note: string;
};

const proposedMatch = (problemId: number, confidence: number, reason: string): MatchingExample["proposal"] => ({
  match: { problemId, problemTitle: byId.get(problemId)!.title, confidence, reason },
  newProblem: { title: "(not used)", need: "(not used)" },
});

const proposedNew = (title: string, need: string): MatchingExample["proposal"] => ({
  match: null,
  newProblem: { title, need },
});

/** The reviews, oldest first. Every one is a correction, so all of them are Matching examples. */
export const ABLATION_REVIEWS: SimulatedReview[] = [
  {
    request: {
      title: "Bring my Artisan background profile in",
      description:
        "I have a background profile in Artisan for my Ethiopian roast. I want to load it here so I can roast against it next time.",
    },
    proposal: proposedMatch(1, 0.82, "Both are about bringing roast data in from Artisan instead of re-typing it."),
    submitterChoice: "accepted",
    verdict: "move",
    from: 1,
    to: 2,
    note: "A profile you want to roast against next time is a target, not a record of a roast you already did. Where the file comes from doesn't matter.",
  },
  {
    request: {
      title: "Export my barista friend's recipe into my library",
      description:
        "A friend sent me her Kalita recipe. Let me export it into my own recipes so I can play with the grind and pours.",
    },
    proposal: proposedMatch(3, 0.7, "Both ask to export recipe data."),
    submitterChoice: "accepted",
    verdict: "move",
    from: 3,
    to: 4,
    note: "Getting data out means my own data leaving the app. Taking someone else's recipe in as my own copy is a different need, whatever word they use.",
  },
  {
    request: {
      title: "Dial numbers shifted after new burrs",
      description:
        "I fitted new burrs and now every saved grind number is off by about three steps. All my settings history is useless.",
    },
    proposal: proposedMatch(5, 0.78, "Both are about the grind settings the app remembers."),
    submitterChoice: "accepted",
    verdict: "move",
    from: 5,
    to: 6,
    note: "Remembering a setting assumes the dial means the same thing. When servicing changes what the numbers mean, it's calibration.",
  },
  {
    request: {
      title: "Grams stuck in the grinder",
      description: "Some coffee always stays in my grinder between doses. I want the app to know about it.",
    },
    proposal: proposedMatch(6, 0.64, "Both are about the grinder's settings drifting from what's recorded."),
    submitterChoice: "accepted",
    verdict: "move",
    from: 6,
    to: 7,
    note: "Retention is about coffee in versus coffee out of the grinder. Calibration is about what the dial numbers mean.",
  },
  {
    request: {
      title: "Halve a recipe for a single cup",
      description: "My recipe makes two cups. When I'm brewing just for me I want half the coffee and half the water.",
    },
    proposal: proposedNew(
      "Adjust a recipe for a different cup size",
      "I need to change how much a recipe makes, so I brew the right amount.",
    ),
    submitterChoice: "no_match",
    verdict: "move",
    from: null,
    to: 9,
    note: "Scaling a recipe while keeping its ratio is the same need as working out water for a ratio.",
  },
  {
    request: {
      title: "Back up my logs to Dropbox",
      description: "If the app disappears I lose years of roasts. Save a copy of everything somewhere I control.",
    },
    proposal: proposedNew(
      "Keep my logs safe from loss",
      "I need my logs stored somewhere safe, so I never lose them.",
    ),
    submitterChoice: "no_match",
    verdict: "move",
    from: null,
    to: 3,
    note: "Backups are part of getting my data out: one export solves both.",
  },
  {
    request: {
      title: "Track the roasted beans I'm resting",
      description: "After roasting I rest beans for a week. Show me how much of each roast is still waiting on the shelf.",
    },
    proposal: proposedMatch(8, 0.71, "Both are about tracking how much coffee is left."),
    submitterChoice: "accepted",
    verdict: "split",
    from: 8,
    to: 10,
    note: "Green stock is about reordering from the importer. Roasted coffee on the shelf is a separate need.",
  },
  {
    request: {
      title: "Auto-send roasts to Google Sheets",
      description: "Every roast I log should appear in my Google Sheet automatically.",
    },
    proposal: proposedMatch(3, 0.76, "Both want roast data in a spreadsheet."),
    submitterChoice: "accepted",
    verdict: "split",
    from: 3,
    to: 11,
    note: "A one-off export or backup isn't the same as keeping another tool in sync as I log.",
  },
];

/** The reviews as the Matcher sees Matching examples: corrections first, most recently reviewed first. */
export function ablationMatchingExamples(): MatchingExample[] {
  const base = Date.UTC(2026, 10, 1);
  return ABLATION_REVIEWS.map((r, i): MatchingExample => {
    const reviewedAt = new Date(base + i * 86_400_000);
    return {
      id: i + 1,
      createdAt: reviewedAt,
      request: { id: i + 1, ...r.request },
      submitter: { id: 1, name: "Simulated submitter", role: "customer" },
      proposal: r.proposal,
      submitterChoice: r.submitterChoice,
      currentProblem: ref(r.to),
      aiCall: null,
      review: {
        verdict: r.verdict,
        note: r.note,
        reviewer: { id: 2, name: "Simulated PM" },
        reviewedAt,
        fromProblem: r.from === null ? null : ref(r.from),
        toProblem: ref(r.to),
      },
    };
  }).reverse();
}

const boundary = (id: string, title: string, description: string, expected: MatcherCase["expected"]): MatcherCase => ({
  id: `ablation-boundary-${id}`,
  kind: "boundary",
  must: false,
  source: SOURCE,
  problems: ABLATION_PROBLEMS,
  request: { title, description },
  expected,
});

const golden = (id: string, title: string, description: string, expected: MatcherCase["expected"]): MatcherCase => ({
  ...boundary(id, title, description, expected),
  id: `ablation-golden-${id}`,
  kind: "golden",
});

/** One boundary case per review's line. The tempting wrong answer is in each comment. */
export const ABLATION_BOUNDARY_CASES: MatcherCase[] = [
  // Tempting: 1 (it names Cropster, the roasting software).
  boundary(
    "cropster-curve-target",
    "Load a Cropster roast curve as my target",
    "I want to bring in a curve from Cropster and see it as a reference line while I roast my next batch of the same bean.",
    2,
  ),
  // Tempting: 3 (it says download).
  boundary(
    "download-shared-recipe",
    "Download a shared recipe so I can edit it",
    "My café shared their V60 recipe as a link. I want to download it and change the grind without touching their version.",
    4,
  ),
  // Tempting: 5 (saved settings).
  boundary(
    "settings-wrong-after-cleaning",
    "My saved grind settings stopped working",
    "After I took the grinder apart to clean it, setting 12 now grinds much finer than before. My saved settings are all wrong now.",
    6,
  ),
  // Tempting: 6 or 5 (grinder, settings drifting).
  boundary(
    "dose-out-lighter-than-in",
    "My shots come out lighter than I weighed",
    "I weigh 18 g of beans into the grinder but only 17.4 g comes out. My ratios are off because the app thinks I used 18 g.",
    7,
  ),
  // Tempting: new (a recipe feature, not a calculator).
  boundary(
    "scale-recipe-carafe",
    "Make my recipe for a 1 litre carafe",
    "My recipe is for one mug. On Sundays I brew a litre for the family and I want the same strength, just more of it.",
    9,
  ),
  // Tempting: new (losing data on a new phone, not exporting).
  boundary(
    "new-phone-keep-roasts",
    "Don't lose my roasts when I change phone",
    "I'm getting a new phone next month and I'm scared I'll lose two years of roast logs. I want to know they're safe.",
    3,
  ),
  // Tempting: 8 (stock going down).
  boundary(
    "subtract-dose-from-bag",
    "Take each dose off the bag I'm brewing",
    "Each time I brew, take 18 g off the bag of my own roast I'm using, so I know when to roast that bean again.",
    10,
  ),
  // Tempting: 3 (spreadsheet).
  boundary(
    "roast-lands-in-spreadsheet",
    "Put each roast in my spreadsheet when I save it",
    "I keep a roasting spreadsheet. I'd like each roast to land there the moment I save it, without me doing anything.",
    11,
  ),
];

/** Clear-cut Requests on Problems the notes talk about; a regression here vetoes keeping the notes. */
export const ABLATION_GOLDEN_CASES: MatcherCase[] = [
  golden(
    "artisan-finished-roasts",
    "Pull finished roasts in from Artisan",
    "Artisan records every roast I do. Copying the temperatures and times in here afterwards takes ages. Let me bring each finished roast in.",
    1,
  ),
  golden(
    "csv-export",
    "Download all my brews as a CSV",
    "I want every brew I've logged in a CSV file so I can chart extraction against ratio in a spreadsheet.",
    3,
  ),
  golden(
    "green-sack-low",
    "Warn me when a sack of green beans runs low",
    "I roast 250 g batches from 5 kg sacks. Subtract each batch and tell me when I'm down to the last kilo so I can reorder.",
    8,
  ),
];

/** The cases one arm judges: every boundary case, plus the golden cases where the veto needs them ((b) and (c)). */
export function armCases(arm: AblationArm): MatcherCase[] {
  return arm === "a" ? ABLATION_BOUNDARY_CASES : [...ABLATION_BOUNDARY_CASES, ...ABLATION_GOLDEN_CASES];
}

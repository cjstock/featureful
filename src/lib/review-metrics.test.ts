/**
 * The `/review` metrics: each query is a pure function of the database (and `now`), tested here
 * against an in-memory database. No AI calls are made; AI call records are inserted directly.
 */
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/db";
import {
  aiCalls,
  matchingDecisions,
  people,
  problems,
  requests,
  type AiCallOutcome,
  type AiCallSource,
  type AiModule,
  type AiRelatedType,
  type EscalationReason,
  type MatcherOutcome,
  type Verdict,
} from "@/db/schema";
import {
  agreementRates,
  costPerRequest,
  formatShare,
  decisionNoteShare,
  parseEvalBaseline,
  readEvalBaseline,
  timeToDecision,
  escalationRate,
  refusalsToday,
  spendToday,
  regressionCasesMarked,
} from "@/lib/review-metrics";

const NOW = new Date("2026-11-19T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

let db: Db;
let authorId: number;
let problemId: number;
beforeEach(() => {
  db = createDb(":memory:");
  authorId = db.insert(people).values({ name: "Alex", role: "customer" }).returning().get().id;
  problemId = db.insert(problems).values({ title: "Compare roasts", need: "I need to compare roasts." }).returning().get().id;
});

type DecisionSpec = {
  reasons?: EscalationReason[] | null;
  verdict?: Verdict;
  reviewedAt?: Date;
  createdAt?: Date;
  matcherOutcome?: MatcherOutcome;
  regressionCase?: boolean;
  onProblem?: number;
};

/** A Request and its Matching decision. */
function decision(spec: DecisionSpec = {}) {
  const createdAt = spec.createdAt ?? daysAgo(1);
  const requestId = db
    .insert(requests)
    .values({ problemId: spec.onProblem ?? problemId, authorId, title: "R", description: "D", createdAt })
    .returning()
    .get().id;
  return db
    .insert(matchingDecisions)
    .values({
      requestId,
      proposedTitle: "T",
      proposedNeed: "N",
      submitterChoice: "accepted",
      createdAt,
      matcherOutcome: spec.matcherOutcome ?? "ok",
      escalationReasons: spec.reasons === undefined ? [] : spec.reasons,
      verdict: spec.verdict ?? null,
      reviewedAt: spec.verdict ? (spec.reviewedAt ?? daysAgo(0.5)) : null,
      regressionCase: spec.regressionCase ?? false,
    })
    .returning()
    .get();
}

/** `count` reviewed spot checks with `verdict`, reviewed `days` ago onwards (older each one). */
function spotChecks(count: number, verdict: Verdict, days = 1) {
  for (let i = 0; i < count; i++) {
    decision({ reasons: ["spot_check"], verdict, reviewedAt: daysAgo(days + i / 100) });
  }
}

describe("agreementRates: the PM agreement rate (spot checks)", () => {
  it("is Confirms ÷ reviewed spot checks", () => {
    spotChecks(8, "confirm");
    spotChecks(2, "move", 2);
    expect(agreementRates(db).spotCheck).toEqual({ n: 10, count: 8, value: 0.8 });
  });

  it("covers exactly the last 30 reviewed spot checks: the 31st-newest is out", () => {
    spotChecks(30, "confirm", 1);
    spotChecks(5, "split", 5); // reviewed earlier than all 30 Confirms
    expect(agreementRates(db).spotCheck).toEqual({ n: 30, count: 30, value: 1 });
  });

  it("shows too few (no value) with fewer than 10 spot checks, and has its n at exactly 10", () => {
    spotChecks(9, "confirm");
    expect(agreementRates(db).spotCheck).toEqual({ n: 9, count: 9, value: null });
    spotChecks(1, "move", 3);
    expect(agreementRates(db).spotCheck).toEqual({ n: 10, count: 9, value: 0.9 });
  });

  it("ignores unreviewed spot checks, other Escalations and Auto-accepted decisions", () => {
    spotChecks(10, "confirm");
    decision({ reasons: ["spot_check"] });
    decision({ reasons: ["low_confidence"], verdict: "move" });
    decision({ reasons: [], verdict: "split" });
    expect(agreementRates(db).spotCheck).toEqual({ n: 10, count: 10, value: 1 });
  });

  it("excludes Bypassed decisions", () => {
    spotChecks(10, "confirm");
    decision({ reasons: ["spot_check"], matcherOutcome: "failed", verdict: "move" });
    expect(agreementRates(db).spotCheck.n).toBe(10);
  });

  it("is empty with no reviews", () => {
    expect(agreementRates(db).spotCheck).toEqual({ n: 0, count: 0, value: null });
  });
});

describe("agreementRates: Escalation agreement", () => {
  it("is Confirms ÷ reviewed Escalations other than spot checks, excluding Bypassed ones", () => {
    for (let i = 0; i < 6; i++) decision({ reasons: ["low_confidence"], verdict: "confirm" });
    for (let i = 0; i < 4; i++) decision({ reasons: ["mine_is_different", "near_miss"], verdict: "split" });
    decision({ reasons: ["bypassed"], matcherOutcome: "budget", verdict: "confirm" });
    spotChecks(5, "confirm");
    decision({ reasons: [], verdict: "move" }); // Auto-accepted, reviewed anyway
    expect(agreementRates(db).escalation).toEqual({ n: 10, count: 6, value: 0.6 });
  });

  it("covers the last 30 reviewed Escalations", () => {
    for (let i = 0; i < 31; i++) {
      decision({ reasons: ["low_confidence"], verdict: i === 30 ? "move" : "confirm", reviewedAt: daysAgo(1 + i) });
    }
    expect(agreementRates(db).escalation).toEqual({ n: 30, count: 30, value: 1 });
  });
});

describe("escalationRate", () => {
  it("is escalated ÷ all Matching decisions in the last 7 days, with each reason's count", () => {
    for (let i = 0; i < 7; i++) decision({ reasons: [] });
    decision({ reasons: ["low_confidence", "near_miss"] });
    decision({ reasons: ["bypassed"], matcherOutcome: "off" });
    decision({ reasons: ["spot_check"] });
    expect(escalationRate(db, NOW)).toEqual({
      n: 10,
      count: 3,
      value: 0.3,
      reasons: [
        { reason: "bypassed", count: 1 },
        { reason: "low_confidence", count: 1 },
        { reason: "near_miss", count: 1 },
        { reason: "spot_check", count: 1 },
      ],
    });
  });

  it("includes a decision made exactly 7 days ago and excludes one a millisecond older", () => {
    for (let i = 0; i < 9; i++) decision({ reasons: [] });
    decision({ reasons: ["low_confidence"], createdAt: daysAgo(7) });
    decision({ reasons: ["near_miss"], createdAt: new Date(daysAgo(7).getTime() - 1) });
    expect(escalationRate(db, NOW)).toMatchObject({ n: 10, count: 1, value: 0.1 });
  });

  it("skips decisions whose reasons haven't been computed yet", () => {
    decision({ reasons: null });
    expect(escalationRate(db, NOW)).toEqual({ n: 0, count: 0, value: null, reasons: [] });
  });

  it("shows too few with fewer than 10 decisions", () => {
    decision({ reasons: ["low_confidence"] });
    expect(escalationRate(db, NOW)).toMatchObject({ n: 1, count: 1, value: null });
  });
});

describe("regressionCasesMarked", () => {
  it("counts Match reviews in the last 30 days marked as Regression cases, of the Move and Split reviews then", () => {
    decision({ reasons: ["low_confidence"], verdict: "move", regressionCase: true, reviewedAt: daysAgo(1) });
    decision({ reasons: ["near_miss"], verdict: "split", regressionCase: true, reviewedAt: daysAgo(30) });
    decision({ reasons: ["near_miss"], verdict: "split", regressionCase: true, reviewedAt: new Date(daysAgo(30).getTime() - 1) });
    decision({ reasons: ["near_miss"], verdict: "split", regressionCase: false, reviewedAt: daysAgo(2) });
    decision({ reasons: ["low_confidence"], verdict: "confirm", regressionCase: true, reviewedAt: daysAgo(3) });
    decision({ reasons: ["low_confidence"], verdict: "confirm", reviewedAt: daysAgo(3) });
    expect(regressionCasesMarked(db, NOW)).toEqual({ marked: 3, corrections: 3 });
  });

  it("is zero with no reviews", () => {
    expect(regressionCasesMarked(db, NOW)).toEqual({ marked: 0, corrections: 0 });
  });
});

type CallSpec = {
  module?: AiModule;
  costUsd?: number;
  time?: Date;
  outcome?: AiCallOutcome;
  source?: AiCallSource;
  related?: { type: AiRelatedType; id: number } | null;
};

/** An AI call record (never a real AI call). */
function aiCall(spec: CallSpec = {}) {
  db.insert(aiCalls)
    .values({
      time: spec.time ?? NOW,
      module: spec.module ?? "matcher",
      model: "claude-sonnet-5-5",
      promptVersion: "v",
      outcome: spec.outcome ?? "ok",
      source: spec.source ?? "app",
      costUsd: spec.costUsd ?? 0,
      relatedType: spec.related?.type ?? null,
      relatedId: spec.related?.id ?? null,
      system: "s",
      prompt: "p",
    })
    .run();
}

describe("spendToday", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is today's (UTC) app spend against AI_DAILY_BUDGET_USD", () => {
    vi.stubEnv("AI_DAILY_BUDGET_USD", "2");
    aiCall({ costUsd: 0.5, time: new Date("2026-11-19T00:00:00.000Z") });
    aiCall({ costUsd: 0.25 });
    aiCall({ costUsd: 1, time: new Date("2026-11-18T23:59:59.999Z") }); // yesterday
    aiCall({ costUsd: 1, source: "seed" });
    aiCall({ costUsd: 1, source: "eval" });
    expect(spendToday(db, NOW)).toEqual({ ok: true, spentUsd: 0.75, budgetUsd: 2 });
  });

  it("reports a misconfigured budget instead of throwing", () => {
    vi.stubEnv("AI_DAILY_BUDGET_USD", "lots");
    expect(spendToday(db, NOW)).toEqual({ ok: false });
  });
});

describe("refusalsToday", () => {
  it("counts today's refused app AI calls, split into over budget and switched off", () => {
    aiCall({ outcome: "refused_budget" });
    aiCall({ outcome: "refused_budget", time: new Date("2026-11-19T00:00:00.000Z") });
    aiCall({ outcome: "refused_off", module: "evaluator" });
    aiCall({ outcome: "refused_off", time: new Date("2026-11-18T23:59:59.999Z") });
    aiCall({ outcome: "error" });
    expect(refusalsToday(db, NOW)).toEqual({ budget: 2, off: 1 });
  });

  it("is zero with none", () => {
    expect(refusalsToday(db, NOW)).toEqual({ budget: 0, off: 0 });
  });
});

describe("costPerRequest", () => {
  /** `count` Requests (with decisions) submitted `days` ago, on `onProblem`; returns their ids. */
  function requestsOn(count: number, onProblem: number, days = 1) {
    return Array.from({ length: count }, () => decision({ createdAt: daysAgo(days), onProblem }).requestId);
  }

  it("is the Matcher calls for the last 7 days' Requests plus Evaluator calls on their Problems in the window, ÷ those Requests", () => {
    const other = db.insert(problems).values({ title: "Other", need: "Other need." }).returning().get().id;
    const ids = [...requestsOn(6, problemId), ...requestsOn(4, other)];
    for (const id of ids) aiCall({ module: "matcher", costUsd: 0.01, related: { type: "request", id } });
    aiCall({ module: "evaluator", costUsd: 0.05, related: { type: "problem", id: problemId }, time: daysAgo(2) });
    aiCall({ module: "evaluator", costUsd: 0.05, related: { type: "problem", id: other }, time: daysAgo(6) });
    // Out: an Evaluator call before the window, one on a Problem with no Request in the window,
    // other modules, and eval-run calls.
    aiCall({ module: "evaluator", costUsd: 9, related: { type: "problem", id: problemId }, time: daysAgo(8) });
    const unrelated = db.insert(problems).values({ title: "Unrelated", need: "N." }).returning().get().id;
    aiCall({ module: "evaluator", costUsd: 9, related: { type: "problem", id: unrelated } });
    aiCall({ module: "brief", costUsd: 9, related: { type: "problem", id: problemId } });
    aiCall({ module: "matcher", costUsd: 9, related: { type: "request", id: ids[0] }, source: "eval" });

    const result = costPerRequest(db, NOW);
    expect(result.n).toBe(10);
    expect(result.totalUsd).toBeCloseTo(0.2);
    expect(result.value).toBeCloseTo(0.02);
  });

  it("counts a Request submitted exactly 7 days ago, not one a millisecond older", () => {
    const [inside] = requestsOn(1, problemId, 7);
    const outside = decision({ createdAt: new Date(daysAgo(7).getTime() - 1) }).requestId;
    aiCall({ costUsd: 0.01, related: { type: "request", id: inside } });
    aiCall({ costUsd: 9, related: { type: "request", id: outside } });
    expect(costPerRequest(db, NOW)).toMatchObject({ n: 1, totalUsd: 0.01, value: null });
  });

  it("counts only Evaluator calls made inside the window, from exactly 7 days ago to now", () => {
    requestsOn(10, problemId, 1);
    const evaluator = (time: Date) => aiCall({ module: "evaluator", costUsd: 0.1, related: { type: "problem", id: problemId }, time });
    evaluator(daysAgo(7));
    evaluator(new Date(daysAgo(7).getTime() - 1));
    evaluator(new Date(NOW.getTime() + 1));
    const result = costPerRequest(db, NOW);
    expect(result.totalUsd).toBeCloseTo(0.1);
    expect(result.value).toBeCloseTo(0.01);
  });

  it("shows too few with fewer than 10 Requests, and has a value at 10", () => {
    const ids = requestsOn(9, problemId);
    for (const id of ids) aiCall({ costUsd: 0.02, related: { type: "request", id } });
    expect(costPerRequest(db, NOW)).toMatchObject({ n: 9, value: null });
    requestsOn(1, problemId);
    expect(costPerRequest(db, NOW).value).toBeCloseTo(0.018);
  });

  it("is empty with no recent Requests", () => {
    expect(costPerRequest(db, NOW)).toEqual({ n: 0, totalUsd: 0, value: null });
  });
});

describe("the eval baseline", () => {
  it("reads F1, case accuracy and commit from the committed evals/baseline.json", () => {
    const baseline = readEvalBaseline(path.join(process.cwd(), "evals", "baseline.json"));
    expect(baseline).toMatchObject({ commit: expect.any(String), date: expect.any(Date) });
    expect(baseline?.f1).toBeGreaterThanOrEqual(0);
    expect(baseline?.caseAccuracy).toBeLessThanOrEqual(1);
  });

  it("parses the fields it shows", () => {
    expect(
      parseEvalBaseline({
        commit: "abc123",
        date: "2026-11-19T05:36:31.469Z",
        replay: { f1: 0.85, precision: 1 },
        caseScores: { accuracy: 0.92 },
      }),
    ).toEqual({ commit: "abc123", date: new Date("2026-11-19T05:36:31.469Z"), f1: 0.85, caseAccuracy: 0.92 });
  });

  it("is null when the file is missing or malformed", () => {
    expect(readEvalBaseline(path.join(process.cwd(), "evals", "no-such-baseline.json"))).toBeNull();
    expect(parseEvalBaseline({ commit: "abc123" })).toBeNull();
    expect(parseEvalBaseline("nope")).toBeNull();
  });
});

describe("timeToDecision", () => {
  /** A Problem first decided `decidedDaysAgo` days ago (null: never recorded), its first Request `firstDaysAgo` days ago. */
  function problemDecided(firstDaysAgo: number, decidedDaysAgo: number | null, status: "planned" | "open" = "planned") {
    const id = db
      .insert(problems)
      .values({ title: "P", need: "N", status, firstDecidedAt: decidedDaysAgo === null ? null : daysAgo(decidedDaysAgo) })
      .returning()
      .get().id;
    decision({ onProblem: id, createdAt: daysAgo(firstDaysAgo) });
    decision({ onProblem: id, createdAt: daysAgo(firstDaysAgo - 0.5) }); // a later Request
    return id;
  }

  it("is the median days from a Problem's first Request to its first non-Open Status", () => {
    for (let i = 1; i <= 11; i++) problemDecided(i + 2, 2); // 1, 2, …, 11 days
    problemDecided(20, 1, "open"); // reopened since: its first decision still counts (19 days)
    problemDecided(20, null); // decided before the time was recorded
    problemDecided(20, null, "open"); // never decided
    expect(timeToDecision(db)).toEqual({ n: 12, medianDays: 6.5, untimed: 1 });
  });

  it("takes the middle value with an odd n", () => {
    for (let i = 1; i <= 11; i++) problemDecided(i + 2, 2);
    expect(timeToDecision(db)).toMatchObject({ n: 11, medianDays: 6 });
  });

  it("shows too few with fewer than 10 timed decisions, and is empty with none", () => {
    expect(timeToDecision(db)).toEqual({ n: 0, medianDays: null, untimed: 0 });
    for (let i = 1; i <= 9; i++) problemDecided(i + 2, 2);
    expect(timeToDecision(db)).toEqual({ n: 9, medianDays: null, untimed: 0 });
    problemDecided(12, 2);
    expect(timeToDecision(db)).toMatchObject({ n: 10, medianDays: 5.5 });
  });
});

describe("decisionNoteShare", () => {
  it("is the share of non-Open Problems with a Decision note", () => {
    const add = (status: "open" | "planned" | "declined" | "shipped", decisionNote: string | null) =>
      db.insert(problems).values({ title: "P", need: "N", status, decisionNote }).run();
    for (let i = 0; i < 7; i++) add("planned", "We're on it.");
    add("declined", null);
    add("shipped", "   ");
    add("shipped", null);
    add("open", "Not decided yet."); // plus the Open Problem from beforeEach
    expect(decisionNoteShare(db)).toEqual({ n: 10, count: 7, value: 0.7 });
  });

  it("is empty with no decided Problems, and too few below 10", () => {
    expect(decisionNoteShare(db)).toEqual({ n: 0, count: 0, value: null });
    db.insert(problems).values({ title: "P", need: "N", status: "shipped", decisionNote: "Done." }).run();
    expect(decisionNoteShare(db)).toEqual({ n: 1, count: 1, value: null });
  });
});

describe("formatShare", () => {
  it("shows a percentage with n at 10 or more, and 'too few' below", () => {
    expect(formatShare({ n: 30, count: 24, value: 0.8 })).toBe("80%");
    expect(formatShare({ n: 4, count: 4, value: null })).toBe("n = 4, too few");
    expect(formatShare({ n: 0, count: 0, value: null })).toBe("n = 0, too few");
  });
});

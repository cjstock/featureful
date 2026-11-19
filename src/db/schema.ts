import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/** Roles a person can have. Support agents and PMs are Internal stakeholders. */
export const ROLES = ["customer", "support_agent", "pm"] as const;
export type Role = (typeof ROLES)[number];

/** Where a Problem stands. */
export const STATUSES = [
  "open",
  "planned",
  "in_progress",
  "shipped",
  "declined",
] as const;
export type Status = (typeof STATUSES)[number];

/** What the submitter did with the Matcher's proposal. */
export const SUBMITTER_CHOICES = ["accepted", "rejected", "no_match"] as const;
export type SubmitterChoice = (typeof SUBMITTER_CHOICES)[number];

/** A PM's Match review verdict. */
export const VERDICTS = ["confirm", "move", "split"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** How the Matcher took part in a Matching decision: it answered, failed, was switched off, or was out of budget. */
export const MATCHER_OUTCOMES = ["ok", "failed", "off", "budget"] as const;
export type MatcherOutcome = (typeof MATCHER_OUTCOMES)[number];

/** Escalation reasons, strongest first (the Escalation queue's ranking). */
export const ESCALATION_REASONS = [
  "bypassed",
  "mine_is_different",
  "high_demand_merge",
  "low_confidence",
  "near_miss",
  "spot_check",
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

/**
 * The AI modules: each AI call record names exactly one. Includes retired modules, so AI call
 * records they made still read.
 */
export const AI_MODULES = ["matcher", "evaluator", "boundary_note", "decision_note", "brief"] as const;
export type AiModule = (typeof AI_MODULES)[number];

/** Modules that make no more AI calls: `boundary_note`, the Boundary-note writer, cut by ADR 0003. */
export const RETIRED_AI_MODULES = ["boundary_note"] as const satisfies readonly AiModule[];

/** The modules `aiGenerate` accepts: every AI module except the retired ones. */
export type CallableAiModule = Exclude<AiModule, (typeof RETIRED_AI_MODULES)[number]>;

/** Every callable AI module, in display order (AI controls on `/strategy`). */
export const CALLABLE_AI_MODULES = ["matcher", "evaluator", "decision_note", "brief"] as const satisfies readonly CallableAiModule[];

/** What started an AI call: the app, the seed script, or an eval run. */
export const AI_CALL_SOURCES = ["app", "seed", "eval"] as const;
export type AiCallSource = (typeof AI_CALL_SOURCES)[number];

/** How an AI call ended. `refused_*` calls were never sent. */
export const AI_CALL_OUTCOMES = ["ok", "error", "parse_failed", "refused_budget", "refused_off"] as const;
export type AiCallOutcome = (typeof AI_CALL_OUTCOMES)[number];

/** What an AI call was about. */
export const AI_RELATED_TYPES = ["request", "problem", "decision"] as const;
export type AiRelatedType = (typeof AI_RELATED_TYPES)[number];

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const people = sqliteTable("people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  role: text("role", { enum: ROLES }).notNull(),
});

/** Single row (id = 1) holding the Product Strategy text. */
export const productStrategy = sqliteTable("product_strategy", {
  id: integer("id").primaryKey(),
  body: text("body").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const problems = sqliteTable("problems", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  /** The underlying need, stated independently of any solution. */
  need: text("need").notNull(),
  status: text("status", { enum: STATUSES }).notNull().default("open"),
  decisionNote: text("decision_note"),
  createdAt: createdAt(),

  // AI evaluation: each criterion is a 1–5 score plus a one-line reason.
  // Null until the Evaluator has run. Demand is never stored.
  impactScore: integer("impact_score"),
  impactReason: text("impact_reason"),
  strategicFitScore: integer("strategic_fit_score"),
  strategicFitReason: text("strategic_fit_reason"),
  effortScore: integer("effort_score"),
  effortReason: text("effort_reason"),
  riskScore: integer("risk_score"),
  riskReason: text("risk_reason"),
  evaluatedAt: integer("evaluated_at", { mode: "timestamp_ms" }),

  // PM override of the Priority score (0–100). Both set or both null.
  overrideScore: integer("override_score"),
  overrideNote: text("override_note"),

  // Decision brief.
  briefMarkdown: text("brief_markdown"),
  briefGeneratedAt: integer("brief_generated_at", { mode: "timestamp_ms" }),
});

/** A Request is always attached to exactly one Problem (as Evidence). */
export const requests = sqliteTable("requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  problemId: integer("problem_id")
    .notNull()
    .references(() => problems.id, { onDelete: "cascade" }),
  authorId: integer("author_id")
    .notNull()
    .references(() => people.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  createdAt: createdAt(),
});

/** A person supports a given Problem at most once. */
export const supports = sqliteTable(
  "supports",
  {
    personId: integer("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    problemId: integer("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.personId, t.problemId] })],
);

/**
 * AI call: one attempt by an AI module, with what it was shown, what it returned, what it cost
 * and its outcome. Written only by `aiGenerate` (src/lib/ai.ts). Content is PM-only.
 */
export const aiCalls = sqliteTable("ai_calls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  time: integer("time", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  module: text("module", { enum: AI_MODULES }).notNull(),
  model: text("model").notNull(),
  /** Short hash of the module's system prompt. */
  promptVersion: text("prompt_version").notNull(),
  inputNoCache: integer("input_no_cache").notNull().default(0),
  cacheRead: integer("cache_read").notNull().default(0),
  cacheWrite: integer("cache_write").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  outcome: text("outcome", { enum: AI_CALL_OUTCOMES }).notNull(),
  error: text("error"),
  relatedType: text("related_type", { enum: AI_RELATED_TYPES }),
  relatedId: integer("related_id"),
  /** Who triggered it (null for the seed and evals). */
  personId: integer("person_id").references(() => people.id, { onDelete: "set null" }),
  source: text("source", { enum: AI_CALL_SOURCES }).notNull(),
  /** The system prompt as sent, so an old prompt version can be reproduced. */
  system: text("system").notNull(),
  /** The rendered prompt as sent. */
  prompt: text("prompt").notNull(),
  /** The model's raw output (null when there was none). */
  output: text("output"),
  /** Matcher only: the structured Problems it was shown. */
  shownProblems: text("shown_problems", { mode: "json" }),
});

/**
 * Off switch: one row per callable AI module, on by default. A PM flips it in AI controls on
 * `/strategy`; an app AI call to a switched-off module is refused (`refused_off`). A module with
 * no row is on.
 */
export const aiModuleSettings = sqliteTable("ai_module_settings", {
  module: text("module", { enum: AI_MODULES }).primaryKey(),
  on: integer("on", { mode: "boolean" }).notNull().default(true),
});

/** Every flip of an off switch: which module, on or off, who, and when. */
export const aiModuleFlips = sqliteTable("ai_module_flips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  module: text("module", { enum: AI_MODULES }).notNull(),
  on: integer("on", { mode: "boolean" }).notNull(),
  personId: integer("person_id")
    .notNull()
    .references(() => people.id),
  at: integer("at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Matching decision: what the Matcher proposed for a Request and what the
 * submitter chose, with its Escalation reasons. One per Request. Review fields are null until a
 * PM gives a Match review.
 */
export const matchingDecisions = sqliteTable("matching_decisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: integer("request_id")
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: "cascade" }),

  // The Matcher's proposal. Match fields are null when it proposed no match.
  proposedProblemId: integer("proposed_problem_id").references(() => problems.id, {
    onDelete: "set null",
  }),
  confidence: real("confidence"),
  reason: text("reason"),
  proposedTitle: text("proposed_title").notNull(),
  proposedNeed: text("proposed_need").notNull(),

  submitterChoice: text("submitter_choice", { enum: SUBMITTER_CHOICES }).notNull(),
  createdAt: createdAt(),

  // Escalation. `matcherOutcome` is "ok" unless the Matcher was bypassed. When it proposed a new
  // Problem, the closest existing Problem and its confidence (null if none or not reported).
  matcherOutcome: text("matcher_outcome", { enum: MATCHER_OUTCOMES }).notNull().default("ok"),
  closestProblemId: integer("closest_problem_id").references(() => problems.id, {
    onDelete: "set null",
  }),
  closestConfidence: real("closest_confidence"),
  /**
   * Escalation reasons, strongest first, computed at confirm time. Empty: Auto-accepted.
   * Null only until the post-migration backfill has run.
   */
  escalationReasons: text("escalation_reasons", { mode: "json" }).$type<EscalationReason[]>(),

  // The Matcher's AI call (null for decisions made before AI call records, or without one).
  promptVersion: text("prompt_version"),
  aiCallId: integer("ai_call_id").references(() => aiCalls.id, { onDelete: "set null" }),

  // Match review.
  verdict: text("verdict", { enum: VERDICTS }),
  reviewerId: integer("reviewer_id").references(() => people.id),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  note: text("note"),
  fromProblemId: integer("from_problem_id").references(() => problems.id, {
    onDelete: "set null",
  }),
  toProblemId: integer("to_problem_id").references(() => problems.id, {
    onDelete: "set null",
  }),
  /** Marked by the PM as a Regression case (`npm run eval:pull` exports it). */
  regressionCase: integer("regression_case", { mode: "boolean" }).notNull().default(false),
});

export type Person = typeof people.$inferSelect;
export type Problem = typeof problems.$inferSelect;
export type NewProblem = typeof problems.$inferInsert;
export type Request = typeof requests.$inferSelect;
export type NewRequest = typeof requests.$inferInsert;
export type Support = typeof supports.$inferSelect;
export type MatchingDecision = typeof matchingDecisions.$inferSelect;
export type AiCall = typeof aiCalls.$inferSelect;
export type AiModuleFlip = typeof aiModuleFlips.$inferSelect;

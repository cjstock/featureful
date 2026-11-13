import {
  integer,
  primaryKey,
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

export type Person = typeof people.$inferSelect;
export type Problem = typeof problems.$inferSelect;
export type NewProblem = typeof problems.$inferInsert;
export type Request = typeof requests.$inferSelect;
export type NewRequest = typeof requests.$inferInsert;
export type Support = typeof supports.$inferSelect;

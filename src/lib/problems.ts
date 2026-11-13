import { and, asc, count, eq, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import {
  people,
  problems,
  requests,
  STATUSES,
  supports,
  type Problem,
  type Status,
} from "@/db/schema";
import { scorePriority, type PriorityScore } from "@/lib/scoring";

/** Read side for browsing Problems. Demand is always computed live from `supports`. */

export const SORTS = ["priority", "support", "newest"] as const;
export type Sort = (typeof SORTS)[number];

export const STATUS_LABELS: Record<Status, string> = {
  open: "Open",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  declined: "Declined",
};

export const SORT_LABELS: Record<Sort, string> = {
  priority: "Priority",
  support: "Most supported",
  newest: "Newest",
};

export interface ProblemQuery {
  /** Keyword matched against title and need. */
  q?: string;
  status?: Status;
  sort?: Sort;
  /** The person browsing; used for `supportedByViewer`. */
  viewerId: number;
  /** Only Problems the viewer supports ("Problems I support"). */
  onlySupported?: boolean;
}

export interface ProblemListItem {
  problem: Problem;
  supporterCount: number;
  evidenceCount: number;
  supportedByViewer: boolean;
  priority: PriorityScore;
}

/** Parse untrusted search params into a query (unknown values are dropped). */
export function parseProblemQuery(params: Record<string, string | string[] | undefined>) {
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const status = one("status");
  const sort = one("sort");
  return {
    q: one("q"),
    status: STATUSES.includes(status as Status) ? (status as Status) : undefined,
    sort: SORTS.includes(sort as Sort) ? (sort as Sort) : undefined,
    onlySupported: one("view") === "supported",
  };
}

export function priorityOf(problem: Problem, supporterCount: number): PriorityScore {
  return scorePriority({
    supporterCount,
    impact: problem.impactScore,
    strategicFit: problem.strategicFitScore,
    effort: problem.effortScore,
    risk: problem.riskScore,
    override: problem.overrideScore,
  });
}

export function listProblems(db: Db, query: ProblemQuery): ProblemListItem[] {
  const supporterCounts = db
    .select({ problemId: supports.problemId, n: count().as("supporter_n") })
    .from(supports)
    .groupBy(supports.problemId)
    .as("supporter_counts");
  const evidenceCounts = db
    .select({ problemId: requests.problemId, n: count().as("evidence_n") })
    .from(requests)
    .groupBy(requests.problemId)
    .as("evidence_counts");
  const mine = db
    .select({ problemId: supports.problemId })
    .from(supports)
    .where(eq(supports.personId, query.viewerId))
    .as("mine");

  const where: SQL[] = [];
  if (query.q) {
    const pattern = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      or(
        sql`${problems.title} like ${pattern} escape '\\'`,
        sql`${problems.need} like ${pattern} escape '\\'`,
      )!,
    );
  }
  if (query.status) where.push(eq(problems.status, query.status));
  if (query.onlySupported) where.push(sql`${mine.problemId} is not null`);

  const rows = db
    .select({
      problem: problems,
      supporterCount: sql<number>`coalesce(${supporterCounts.n}, 0)`,
      evidenceCount: sql<number>`coalesce(${evidenceCounts.n}, 0)`,
      supportedByViewer: sql<number>`${mine.problemId} is not null`,
    })
    .from(problems)
    .leftJoin(supporterCounts, eq(supporterCounts.problemId, problems.id))
    .leftJoin(evidenceCounts, eq(evidenceCounts.problemId, problems.id))
    .leftJoin(mine, eq(mine.problemId, problems.id))
    .where(where.length ? and(...where) : undefined)
    .all();

  const items = rows.map((r) => ({
    problem: r.problem,
    supporterCount: Number(r.supporterCount),
    evidenceCount: Number(r.evidenceCount),
    supportedByViewer: Boolean(r.supportedByViewer),
    priority: priorityOf(r.problem, Number(r.supporterCount)),
  }));

  const newest = (a: ProblemListItem, b: ProblemListItem) =>
    b.problem.createdAt.getTime() - a.problem.createdAt.getTime() || b.problem.id - a.problem.id;
  const sorters: Record<Sort, (a: ProblemListItem, b: ProblemListItem) => number> = {
    priority: (a, b) => b.priority.total - a.priority.total || newest(a, b),
    support: (a, b) => b.supporterCount - a.supporterCount || newest(a, b),
    newest,
  };
  return items.sort(sorters[query.sort ?? "priority"]);
}

export function getProblem(db: Db, problemId: number) {
  const problem = db.select().from(problems).where(eq(problems.id, problemId)).get();
  if (!problem) return undefined;
  const supporters = db
    .select({ id: people.id, name: people.name, role: people.role, supportedAt: supports.createdAt })
    .from(supports)
    .innerJoin(people, eq(people.id, supports.personId))
    .where(eq(supports.problemId, problemId))
    .orderBy(asc(supports.createdAt))
    .all();
  return { problem, supporters, priority: priorityOf(problem, supporters.length) };
}

/** Evidence on a Problem. Pass `authorId` to restrict to one person's own Requests (Customer view). */
export function listEvidence(db: Db, problemId: number, authorId?: number) {
  return db
    .select({ request: requests, author: { id: people.id, name: people.name, role: people.role } })
    .from(requests)
    .innerJoin(people, eq(people.id, requests.authorId))
    .where(
      authorId === undefined
        ? eq(requests.problemId, problemId)
        : and(eq(requests.problemId, problemId), eq(requests.authorId, authorId)),
    )
    .orderBy(asc(requests.createdAt))
    .all();
}

/** Idempotent: supporting twice keeps one Support. */
export function addSupport(db: Db, personId: number, problemId: number) {
  db.insert(supports).values({ personId, problemId }).onConflictDoNothing().run();
}

export function removeSupport(db: Db, personId: number, problemId: number) {
  db.delete(supports)
    .where(and(eq(supports.personId, personId), eq(supports.problemId, problemId)))
    .run();
}

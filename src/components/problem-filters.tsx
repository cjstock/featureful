import Link from "next/link";
import { STATUSES, type Status } from "@/db/schema";
import { SORTS, SORT_LABELS, type Sort } from "@/lib/problems";
import { STATUS_LABELS } from "@/lib/statuses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Keyword search, Status filter and sort. A plain GET form so results are linkable. */
export function ProblemFilters({
  q,
  status,
  sort,
  view,
}: {
  q?: string;
  status?: Status;
  sort: Sort;
  view?: "supported";
}) {
  return (
    <form method="get" action="/" className="flex flex-wrap items-end gap-2">
      {view && <input type="hidden" name="view" value={view} />}
      <div className="min-w-48 flex-1">
        <label htmlFor="q" className="sr-only">
          Search Problems
        </label>
        <Input id="q" name="q" type="search" placeholder="Search Problems…" defaultValue={q} />
      </div>
      <label className="flex items-center gap-1 text-sm text-muted-foreground">
        Status
        <select name="status" defaultValue={status ?? ""} className={selectClass}>
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1 text-sm text-muted-foreground">
        Sort
        <select name="sort" defaultValue={sort} className={selectClass}>
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm">
        Apply
      </Button>
      {(q || status) && (
        <Button size="sm" variant="ghost" render={<Link href={view ? `/?view=${view}` : "/"} />}>
          Clear
        </Button>
      )}
    </form>
  );
}

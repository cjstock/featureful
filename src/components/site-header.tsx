import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { people } from "@/db/schema";
import { getCurrentPerson } from "@/lib/identity";
import { createMatchReview } from "@/lib/match-review";
import { isInternalStakeholder, isPm, ROLE_LABELS } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { IdentitySwitcher } from "@/components/identity-switcher";

export async function SiteHeader() {
  const current = await getCurrentPerson();
  const db = getDb();
  const everyone = db.select().from(people).orderBy(asc(people.id)).all();
  const queueCount = isPm(current) ? createMatchReview({ db }).countQueue() : 0;

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-heading text-lg font-semibold">
          Featureful
        </Link>
        <nav className="flex items-center gap-4">
          {isInternalStakeholder(current) && (
            <Link href="/strategy" className="text-sm font-medium hover:underline">
              Product Strategy
            </Link>
          )}
          {isPm(current) && (
            <Link
              href="/review"
              className="flex items-center gap-1.5 text-sm font-medium hover:underline"
              aria-label={`Match review, ${queueCount} to review`}
            >
              Match review <Badge variant="secondary">{queueCount}</Badge>
            </Link>
          )}
          <Link href="/submit" className="text-sm font-medium hover:underline">
            Submit a Request
          </Link>
          <IdentitySwitcher
            currentId={current.id}
            options={everyone.map((p) => ({
              id: p.id,
              label: `${p.name} (${ROLE_LABELS[p.role]})`,
            }))}
          />
        </nav>
      </div>
    </header>
  );
}

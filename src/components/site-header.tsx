import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { people } from "@/db/schema";
import { getCurrentPerson } from "@/lib/identity";
import { isInternalStakeholder, ROLE_LABELS } from "@/lib/roles";
import { IdentitySwitcher } from "@/components/identity-switcher";

export async function SiteHeader() {
  const current = await getCurrentPerson();
  const everyone = getDb().select().from(people).orderBy(asc(people.id)).all();

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

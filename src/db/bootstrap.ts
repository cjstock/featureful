import type { Db } from "./index";
import { people } from "./schema";

/**
 * Minimal people so the identity switcher works on an empty database.
 * Only runs when there are no people; the seed (ticket 09) replaces them.
 */
export const BOOTSTRAP_PEOPLE = [
  { name: "Alex", role: "customer" },
  { name: "Priya", role: "customer" },
  { name: "Marco", role: "customer" },
  { name: "Dana", role: "support_agent" },
  { name: "Sam", role: "pm" },
] as const;

export function bootstrapPeople(db: Db) {
  if (db.select({ id: people.id }).from(people).limit(1).get()) return;
  db.insert(people).values([...BOOTSTRAP_PEOPLE]).run();
}

import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { people, type Person, type Role } from "@/db/schema";

export const PERSON_COOKIE = "featureful_person_id";

/**
 * The person the browser has chosen in the header switcher. Falls back to the
 * first person (by id) when the cookie is missing or stale. Server only.
 */
export async function getCurrentPerson(): Promise<Person> {
  const db = getDb();
  const id = Number((await cookies()).get(PERSON_COOKIE)?.value);
  const chosen = Number.isInteger(id)
    ? db.select().from(people).where(eq(people.id, id)).get()
    : undefined;
  const person = chosen ?? db.select().from(people).orderBy(asc(people.id)).get();
  if (!person) throw new Error("No people in the database");
  return person;
}

/** For server actions: the current person, or throw if their role is not allowed. */
export async function requireRole(...roles: Role[]): Promise<Person> {
  const person = await getCurrentPerson();
  if (!roles.includes(person.role)) {
    throw new Error(`Only ${roles.join(" or ")} can do this`);
  }
  return person;
}

"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { people } from "@/db/schema";
import { PERSON_COOKIE } from "@/lib/identity";

export async function switchIdentity(personId: number) {
  const person = getDb().select().from(people).where(eq(people.id, personId)).get();
  if (!person) throw new Error("Unknown person");
  (await cookies()).set(PERSON_COOKIE, String(person.id), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

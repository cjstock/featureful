"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { people } from "@/db/schema";
import { idSchema, message, type Result } from "@/lib/action-result";
import { PERSON_COOKIE } from "@/lib/identity";

export async function switchIdentity(personId: number): Promise<Result> {
  try {
    const id = idSchema.parse(personId);
    const person = getDb().select().from(people).where(eq(people.id, id)).get();
    if (!person) return { ok: false, error: "Unknown person" };
    (await cookies()).set(PERSON_COOKIE, String(person.id), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("switchIdentity failed", error);
    return { ok: false, error: message(error) };
  }
}

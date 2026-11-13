"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { addSupport, removeSupport } from "@/lib/problems";
import { getCurrentPerson } from "@/lib/identity";

/** Anyone (Customer, Support agent, PM) can give or withdraw their Support for a Problem. Idempotent either way. */
export async function setSupport(problemId: number, supported: boolean) {
  const person = await getCurrentPerson();
  const db = getDb();
  if (supported) addSupport(db, person.id, problemId);
  else removeSupport(db, person.id, problemId);
  revalidatePath("/");
  revalidatePath(`/problems/${problemId}`);
}

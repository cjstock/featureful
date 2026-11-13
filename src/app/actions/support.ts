"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { idSchema, message, type Result } from "@/lib/action-result";
import { addSupport, removeSupport } from "@/lib/problems";
import { getCurrentPerson } from "@/lib/identity";

/** Anyone (Customer, Support agent, PM) can give or withdraw their Support for a Problem. Idempotent either way. */
export async function setSupport(problemId: number, supported: boolean): Promise<Result> {
  try {
    const person = await getCurrentPerson();
    const id = idSchema.parse(problemId);
    const db = getDb();
    if (z.boolean().parse(supported)) addSupport(db, person.id, id);
    else removeSupport(db, person.id, id);
    revalidatePath("/");
    revalidatePath(`/problems/${id}`);
    return { ok: true };
  } catch (error) {
    console.error("setSupport failed", error);
    return { ok: false, error: message(error) };
  }
}

import type { Person, Role } from "@/db/schema";

export const ROLE_LABELS: Record<Role, string> = {
  customer: "Customer",
  support_agent: "Support agent",
  pm: "PM",
};

/** Support agents and PMs see the full evaluation. */
export function isInternalStakeholder(person: Pick<Person, "role">) {
  return person.role === "support_agent" || person.role === "pm";
}

export function isPm(person: Pick<Person, "role">) {
  return person.role === "pm";
}

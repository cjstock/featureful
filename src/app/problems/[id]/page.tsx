import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { problems } from "@/db/schema";
import { Badge } from "@/components/ui/badge";

// Minimal Problem page so confirmed Requests have somewhere to land.
// Ticket 04 builds the role-specific views.
export default async function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const problem = Number.isInteger(id)
    ? getDb().select().from(problems).where(eq(problems.id, id)).get()
    : undefined;
  if (!problem) notFound();

  return (
    <div className="space-y-3">
      <Badge variant="secondary">{problem.status}</Badge>
      <h1 className="font-heading text-2xl font-semibold">{problem.title}</h1>
      <p className="text-muted-foreground">{problem.need}</p>
    </div>
  );
}

import { desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { problems } from "@/db/schema";
import { getCurrentPerson } from "@/lib/identity";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const person = await getCurrentPerson();
  const all = getDb().select().from(problems).orderBy(desc(problems.createdAt)).all();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Problems</h1>
        <p className="text-muted-foreground">Signed in as {person.name}.</p>
      </div>
      {all.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Problems yet</CardTitle>
            <CardDescription>
              Problems appear here once someone submits a Request.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {all.map((p) => (
            <li key={p.id}>
              <Card>
                <CardHeader>
                  <CardTitle>{p.title}</CardTitle>
                  <CardDescription>{p.need}</CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

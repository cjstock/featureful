import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getCurrentPerson } from "@/lib/identity";
import { budgetStatus, disabledReason, listAiControls, type BudgetStatus } from "@/lib/ai-controls";
import { getProductStrategy } from "@/lib/product-strategy";
import { isInternalStakeholder, isPm } from "@/lib/roles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AiControlsCard } from "@/components/ai-controls-card";
import { ProductStrategyForm } from "@/components/product-strategy-form";
import { ReevaluateButton } from "@/components/reevaluate-button";

const dateTimeFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export const metadata = { title: "Product Strategy · Featureful" };

/**
 * PMs edit the Product Strategy and flip the AI controls; Support agents may read both; Customers
 * don't see this page.
 */
export default async function StrategyPage() {
  const person = await getCurrentPerson();
  if (!isInternalStakeholder(person)) notFound();
  const pm = isPm(person);
  const db = getDb();
  const strategy = getProductStrategy(db);
  let budget: BudgetStatus | null = null;
  try {
    budget = budgetStatus(db, new Date());
  } catch (error) {
    console.error("Couldn't read the AI budget", error);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Product Strategy</h1>
        <p className="text-muted-foreground">
          Who the product serves and what it is trying to achieve. The AI judges each Problem&apos;s
          Strategic fit against this text.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Strategy</CardTitle>
          <CardDescription>
            {strategy.updatedAt
              ? `Last saved ${dateTimeFormat.format(strategy.updatedAt)}.`
              : "The default strategy; not edited yet."}
            {!pm && " Only a PM can edit it."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pm ? (
            <ProductStrategyForm initialBody={strategy.body} />
          ) : (
            <p className="whitespace-pre-wrap text-sm">{strategy.body}</p>
          )}
        </CardContent>
      </Card>

      {pm && (
        <Card>
          <CardHeader>
            <CardTitle>Re-evaluate all Problems</CardTitle>
            <CardDescription>
              Saving the strategy doesn&apos;t change existing scores. Re-evaluate every Problem so
              Strategic fit reflects the current strategy. This makes one AI call per Problem and may
              take a minute.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReevaluateButton variant="default" disabledReason={disabledReason(db, "evaluator")} />
          </CardContent>
        </Card>
      )}

      <AiControlsCard controls={listAiControls(db)} budget={budget} canEdit={pm} />
    </div>
  );
}

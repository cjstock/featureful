import type { Person } from "@/db/schema";
import type { StoredBrief } from "@/lib/brief-writer";
import { isInternalStakeholder, isPm } from "@/lib/roles";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GenerateBriefButton } from "@/components/generate-brief-button";
import { Markdown } from "@/components/markdown";

const dateTimeFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** Decision brief card for the Problem page. Renders nothing for Customers. Never regenerates on view. */
export function DecisionBrief({
  problemId,
  brief,
  viewer,
}: {
  problemId: number;
  brief: StoredBrief | null;
  viewer: Person;
}) {
  if (!isInternalStakeholder(viewer)) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision brief</CardTitle>
        <CardDescription>
          {brief
            ? `Generated ${dateTimeFormat.format(brief.generatedAt)}. Regenerate after new Evidence or a re-evaluation.`
            : isPm(viewer)
              ? "No brief yet. Generate one for the case for and against at a glance."
              : "No brief yet. A PM can generate one."}
        </CardDescription>
        {isPm(viewer) && (
          <CardAction>
            <GenerateBriefButton problemId={problemId} hasBrief={brief !== null} />
          </CardAction>
        )}
      </CardHeader>
      {brief && (
        <CardContent>
          <Markdown source={brief.markdown} />
        </CardContent>
      )}
    </Card>
  );
}

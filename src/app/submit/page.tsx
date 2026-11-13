import { getCurrentPerson } from "@/lib/identity";
import { SubmitRequestForm } from "@/components/submit-request-form";

export default async function SubmitPage() {
  const person = await getCurrentPerson();
  const canSubmit = person.role === "customer" || person.role === "support_agent";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Submit a Request</h1>
        <p className="text-muted-foreground">
          Tell us what you need. Before anything is saved, we&apos;ll check whether it matches a
          Problem someone has already raised.
        </p>
      </div>
      {canSubmit ? (
        <SubmitRequestForm />
      ) : (
        <p className="text-muted-foreground">
          Only Customers and Support agents submit Requests. Switch identity in the header to
          try it.
        </p>
      )}
    </div>
  );
}

import { SubmitRequestForm } from "@/components/submit-request-form";

export default function SubmitPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Submit a Request</h1>
        <p className="text-muted-foreground">
          Tell us what you need. Before anything is saved, we&apos;ll check whether it matches a
          Problem someone has already raised.
        </p>
      </div>
      <SubmitRequestForm />
    </div>
  );
}

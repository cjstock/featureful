import type { Status } from "@/db/schema";
import { STATUS_LABELS } from "@/lib/statuses";
import { Badge } from "@/components/ui/badge";

const VARIANT: Record<Status, "default" | "secondary" | "outline" | "destructive"> = {
  open: "outline",
  planned: "secondary",
  in_progress: "secondary",
  shipped: "default",
  declined: "destructive",
};

export function StatusBadge({ status }: { status: Status }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}

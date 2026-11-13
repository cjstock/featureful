import type { Status } from "@/db/schema";

export const STATUS_LABELS: Record<Status, string> = {
  open: "Open",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  declined: "Declined",
};

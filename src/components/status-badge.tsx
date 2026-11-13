import type { Status } from "@/db/schema";
import { STATUS_LABELS } from "@/lib/statuses";
import { statusTone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TONE_STYLES } from "@/components/tone-styles";

export function StatusBadge({ status }: { status: Status }) {
  return <Badge tone={statusTone(status)}>{STATUS_LABELS[status]}</Badge>;
}

/** Coloured left edge for a Problem card or row (its first cell) in its Status tone. */
export function statusEdgeClass(status: Status) {
  return cn("border-l-4", TONE_STYLES[statusTone(status)].edge);
}

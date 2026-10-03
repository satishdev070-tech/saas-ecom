import { Badge } from "@/components/ui/layout";
import { statusLabel, statusTone } from "../format";

/** Order / payment / fulfilment / return status pill. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>;
}

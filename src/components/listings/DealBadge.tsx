import { Badge } from "@/components/ui/badge";
import type { DealStatus } from "@/types";

interface DealBadgeProps {
  status: DealStatus;
  pctDiff?: number | null;
}

export function DealBadge({ status, pctDiff }: DealBadgeProps) {
  if (status === "good") {
    const pctStr = pctDiff != null ? ` ${Math.abs(pctDiff).toFixed(0)}% below` : "";
    return <Badge variant="success">Good Deal{pctStr}</Badge>;
  }
  if (status === "overpriced") {
    const pctStr = pctDiff != null ? ` +${pctDiff.toFixed(0)}%` : "";
    return <Badge variant="destructive">Overpriced{pctStr}</Badge>;
  }
  if (status === "fair") {
    return <Badge variant="warning">Fair</Badge>;
  }
  return <Badge variant="ghost">–</Badge>;
}

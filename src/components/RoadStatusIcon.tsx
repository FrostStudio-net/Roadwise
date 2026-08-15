import { OctagonX, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { RiskLevel } from "@/types/analysis";

const ROAD_STATUS_ICONS: Record<RiskLevel, LucideIcon> = {
  normal: ShieldCheck,
  caution: ShieldAlert,
  difficult: TriangleAlert,
  closed: OctagonX,
};

export default function RoadStatusIcon({ level, size = 27, strokeWidth = 1.5 }: { level: RiskLevel; size?: number; strokeWidth?: number }) {
  const Icon = ROAD_STATUS_ICONS[level];
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
}

import type { RiskLevel } from "@/types/analysis";

export type RoadStatusStyle = {
  cardClass: string;
  iconClass: string;
  headingClass: string;
  accentClass: string;
  dotClass: string;
};

export const ROAD_STATUS_STYLES: Record<RiskLevel, RoadStatusStyle> = {
  normal: {
    cardClass: "verdict-card-normal",
    iconClass: "border-[#34d399]/20 bg-[#34d399]/10 text-[#34d399]",
    headingClass: "text-[#34d399]",
    accentClass: "text-[#34d399]",
    dotClass: "bg-[#34d399]",
  },
  caution: {
    cardClass: "verdict-card-caution",
    iconClass: "border-[#d48c6b]/20 bg-[#d48c6b]/10 text-[#d48c6b]",
    headingClass: "text-[#e8c4b0]",
    accentClass: "text-[#d48c6b]",
    dotClass: "bg-[#e8c4b0]",
  },
  difficult: {
    cardClass: "verdict-card-difficult",
    iconClass: "border-[#d48c6b]/25 bg-[#7a3b2e]/25 text-[#d48c6b]",
    headingClass: "text-[#d48c6b]",
    accentClass: "text-[#d48c6b]",
    dotClass: "bg-[#d48c6b]",
  },
  closed: {
    cardClass: "verdict-card-closed",
    iconClass: "border-[#ef8e76]/30 bg-[#7a3b2e]/35 text-[#ef8e76]",
    headingClass: "text-[#ef8e76]",
    accentClass: "text-[#ef8e76]",
    dotClass: "bg-[#ef8e76]",
  },
};

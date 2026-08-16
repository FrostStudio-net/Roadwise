import type { ReactNode } from "react";

export type ConditionTone = "good" | "caution" | "difficult" | "closed" | "neutral";
type Props = { icon: ReactNode; label: string; value: string; note?: string; tone?: ConditionTone };

const tones: Record<ConditionTone, string> = {
  good: "text-[#34d399]",
  caution: "text-[#e8c4b0]",
  difficult: "text-[#d48c6b]",
  closed: "text-[#ef8e76]",
  neutral: "text-[#82908d]",
};

export default function ConditionCard({ icon, label, value, note, tone = "neutral" }: Props) {
  return (
    <div className="glass card relative min-w-0 overflow-hidden p-3.5">
      <div className={`topo-lines ${tones[tone]}`} />
      <div className={`relative ${tones[tone]}`}>{icon}</div>
      <div className="relative mt-3">
        <div className="truncate text-[8px] font-semibold uppercase tracking-[0.13em] text-[#82908d]">{label}</div>
        <div className={`mt-1 text-[11px] font-semibold leading-4 ${tones[tone]}`}>{value}</div>
        {note ? <div className="mt-0.5 truncate text-[9px] text-[#8e9b98]">{note}</div> : null}
      </div>
    </div>
  );
}

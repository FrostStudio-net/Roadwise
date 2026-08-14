import { ReactNode } from "react";

type Props = { icon: ReactNode; label: string; value: string; note?: string; tone?: "good" | "warning" | "neutral"; featured?: boolean };

const tones = { good: "text-[#34d399]", warning: "text-[#d48c6b]", neutral: "text-[#69a8a3]" };

export default function ConditionCard({ icon, label, value, note, tone = "neutral", featured }: Props) {
  return (
    <div className={`glass card relative min-w-0 overflow-hidden p-4 ${featured ? "min-h-[126px]" : "min-h-[108px]"}`}>
      <div className={`topo-lines ${tones[tone]}`} />
      <div className={`relative ${tones[tone]}`}>{icon}</div>
      <div className="relative mt-4">
        <div className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[#82908d]">{label}</div>
        <div className={`mt-1 text-sm font-semibold ${tones[tone]}`}>{value}</div>
        {note && <div className="mt-1 text-[10px] text-[#8e9b98]">{note}</div>}
      </div>
    </div>
  );
}

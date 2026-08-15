import { Navigation, Play, Route } from "lucide-react";

import BottomNav from "@/components/BottomNav";

export default function DriveEmptyState({ onCheckDrive, onJustDrive }: { onCheckDrive: () => void; onJustDrive: () => void }) {
  return <><main className="page-shell"><header className="flex items-center gap-3"><div className="glass flex h-13 w-13 items-center justify-center rounded-full border-[#69a8a3]/25 text-[#69a8a3]"><Route size={20} /></div><div className="eyebrow">Drive Mode</div></header><section className="glass card section-block-lg p-6"><Navigation size={28} className="text-[#69a8a3]" /><h1 className="mt-5 text-[30px] font-semibold tracking-[-0.045em]">No active drive</h1><p className="mt-3 text-[13px] leading-6 text-[#9ca7a4]">Check a route first or use Just Drive.</p><div className="mt-6 grid gap-2.5"><button type="button" onClick={onCheckDrive} className="primary-button min-h-14">Check a drive <Navigation size={18} /></button><button type="button" onClick={onJustDrive} className="glass flex min-h-14 w-full items-center justify-center gap-2 rounded-[22px] text-[13px] font-semibold text-[#c7d0cd]">Just Drive <Play size={17} /></button></div></section></main><BottomNav /></>;
}

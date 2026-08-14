"use client";

import { AlertTriangle, CloudOff, Map, Route, ShieldCheck, Volume2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import BottomNav from "@/components/BottomNav";
import DataAttribution from "@/components/DataAttribution";
import { readRouteAnalysis } from "@/lib/route-analysis-storage";
import type { AnalyseRouteResponse } from "@/types/analysis";

export default function DrivePage() {
  const router = useRouter();
  const [result, setResult] = useState<AnalyseRouteResponse>();
  useEffect(() => {
    const stored = readRouteAnalysis();
    queueMicrotask(() => setResult(stored));
  }, []);

  const warning = result?.analysis.warnings[0];
  const route = result?.route;

  return (
    <>
      <main className="page-shell">
        <header className="flex items-center justify-between">
          <div className="glass flex h-13 w-13 items-center justify-center rounded-full border-[#d48c6b]/30 text-[#d48c6b]"><Route size={20} /></div>
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-[.14em] text-[#77dcb3]"><span className="h-1.5 w-1.5 rounded-full bg-[#82908d]" />GPS off · Preview</div>
          <button onClick={() => router.push("/")} aria-label="Exit drive mode" className="glass flex h-11 w-11 items-center justify-center rounded-[17px] text-[#9ca7a4]"><X size={19} /></button>
        </header>

        <section className="mt-10 text-center">
          <div className="text-[10px] uppercase tracking-[.2em] text-[#7d8a87]">Loaded route</div>
          <div className="mt-3 text-[38px] font-light leading-tight tracking-[-0.055em]">{route?.destination.name ?? "No route loaded"}</div>
          <div className="mt-2 text-[12px] text-[#8e9b98]">{route ? `${route.distanceKm.toLocaleString()} km · ${formatDuration(route.durationMinutes)}` : "Run a route check before opening Drive Mode"}</div>
          <div className="mx-auto mt-7 h-px w-[72%] bg-gradient-to-r from-transparent via-[#69a8a3]/40 to-transparent" />
          <div className="mt-5 text-[10px] uppercase tracking-[.13em] text-[#7d8a87]">Live speed and navigation are not enabled</div>
        </section>

        <section className="glass card section-block-lg relative overflow-hidden border-[#7a3b2e]/35">
          <div className="topo-lines text-[#7a3b2e]" />
          <div className="relative flex items-start gap-4 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[#7a3b2e]/25 text-[#d48c6b]">
              {warning ? <AlertTriangle size={22} /> : result?.analysis.available ? <ShieldCheck size={22} /> : <CloudOff size={22} />}
            </div>
            <div className="min-w-0 flex-1"><div className="eyebrow">Latest route check</div><div className="mt-1 text-[17px] font-semibold text-[#e8c4b0]">{warning?.title ?? result?.analysis.title ?? "Live data unavailable"}</div><div className="mt-1 text-[11px] leading-5 text-[#8e9b98]">{warning ? `${warning.distanceAheadKm !== undefined ? `${warning.distanceAheadKm.toFixed(1)} km ahead · ` : ""}${warning.source}` : result?.analysis.summary ?? "Check a route to load official conditions."}</div></div>
          </div>
          <div className="relative flex items-start gap-3 border-t border-white/[.06] bg-black/[.07] px-5 py-4"><Volume2 size={18} className="mt-0.5 shrink-0 text-[#69a8a3]" /><div><div className="text-[9px] font-semibold uppercase tracking-[.14em] text-[#7faaa6]">Roadwise note</div><p className="mt-1 text-[12px] leading-5 text-[#aab3b0]">This is a static summary of the latest route check, not continuous navigation. Conditions can change rapidly.</p></div></div>
        </section>

        <div className="section-block grid grid-cols-2 gap-2.5"><button onClick={() => router.push("/check")} className="glass card flex items-center justify-center gap-2 py-4 text-[12px]"><AlertTriangle size={17} className="text-[#d48c6b]" />Route check</button><button onClick={() => router.push("/roads")} className="glass card flex items-center justify-center gap-2 py-4 text-[12px]"><Map size={17} className="text-[#69a8a3]" />Roads</button></div>
        <DataAttribution includeImo />
      </main><BottomNav />
    </>
  );
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours} hr ${remainder} min` : `${remainder} min`;
}

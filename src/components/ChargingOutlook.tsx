"use client";

import { ArrowUpRight, BatteryCharging, CloudOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { GeoJsonLineString } from "@/types/road";

type OutlookResponse = {
  available: boolean;
  chargerCount?: number;
  longestGapKm?: number;
  error?: string;
};

export default function ChargingOutlook({ route, distanceKm }: { route: GeoJsonLineString; distanceKm: number }) {
  const [outlook, setOutlook] = useState<OutlookResponse>();

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/services/charging-outlook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route, distanceKm }),
      signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json() as OutlookResponse;
      if (!response.ok) throw new Error(result.error ?? "Charging outlook is unavailable");
      setOutlook(result);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setOutlook({ available: false, error: "Charging outlook is temporarily unavailable." });
    });
    return () => controller.abort();
  }, [distanceKm, route]);

  if (!outlook) {
    return <section className="motion-crossfade surface-panel section-block p-4" aria-busy="true"><div className="flex items-center gap-3"><span className="motion-skeleton h-10 w-10 rounded-[15px] bg-[#2d6b6b]/18" /><div className="flex-1"><div className="eyebrow">Charging outlook</div><div className="motion-skeleton mt-2 h-3 w-44 rounded-full bg-white/[.06]" /></div></div></section>;
  }

  if (!outlook.available) {
    return <section className="motion-crossfade surface-panel section-block flex gap-3 p-4"><CloudOff size={20} className="shrink-0 text-[#82908d]" /><div><div className="text-[13px] font-semibold">Charging outlook unavailable</div><p className="mt-1 text-[10px] leading-5 text-[#82908d]">Fuel / EV remains available for manual checking.</p></div></section>;
  }

  return <section className="motion-state-enter surface-panel section-block p-4"><div className="flex gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[17px] bg-[#2d6b6b]/18 text-[#69a8a3]"><BatteryCharging size={20} /></span><div className="min-w-0"><div className="eyebrow">Charging outlook</div><h2 className="mt-1 text-[16px] font-semibold">{outlook.chargerCount ?? 0} Roadwise-listed charger{outlook.chargerCount === 1 ? "" : "s"} near this route</h2>{outlook.longestGapKm !== undefined ? <p className="mt-2 text-[11px] leading-5 text-[#e8c4b0]">Longest listed charger gap: approximately {Math.round(outlook.longestGapKm)} km.</p> : null}</div></div><p className="mt-3 text-[10px] leading-5 text-[#82908d]">Route outlook only—not a charging plan. Roadwise does not know battery level, range, compatibility or charger availability.</p><Link prefetch href="/fuel?vehicle=Electric+vehicle&mode=route&filter=ev" className="motion-press mt-3 flex min-h-11 items-center justify-center gap-2 rounded-[17px] border border-[#69a8a3]/20 bg-[#2d6b6b]/12 px-4 text-[11px] font-semibold text-[#b9d4d0]">View chargers along route <ArrowUpRight size={16} /></Link></section>;
}

"use client";

import { AlertTriangle, CloudOff, LocateFixed, Navigation, Play, Route, ShieldCheck, Volume2, VolumeX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import BottomNav from "@/components/BottomNav";
import DataAttribution from "@/components/DataAttribution";
import DriveEmptyState from "@/components/DriveEmptyState";
import { useLiveLocation } from "@/hooks/use-live-location";
import { useWarningAnnouncer } from "@/hooks/use-warning-announcer";
import { calculateRouteProgress, upcomingWarnings } from "@/lib/route-progress";
import { readRouteAnalysis } from "@/lib/route-analysis-storage";
import type { AnalyseRouteResponse } from "@/types/analysis";

export default function DrivePage() {
  const router = useRouter();
  const [result, setResult] = useState<AnalyseRouteResponse>();
  const [restored, setRestored] = useState(false);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const { status, location, start, stop } = useLiveLocation();

  useEffect(() => {
    const stored = readRouteAnalysis();
    queueMicrotask(() => {
      setResult(stored);
      setRestored(true);
    });
  }, []);

  const routeProgress = useMemo(() => result?.route.geometry && location
    ? calculateRouteProgress(result.route.geometry, location.coordinates, location.accuracyMeters)
    : undefined, [location, result]);
  const upcoming = useMemo(() => routeProgress?.status === "onRoute" && routeProgress.distanceTravelledKm !== undefined
    ? upcomingWarnings(result?.analysis.warnings ?? [], routeProgress.distanceTravelledKm)
    : [], [result, routeProgress]);
  const primary = upcoming[0];
  useWarningAnnouncer(upcoming, started && routeProgress?.status === "onRoute", muted);

  const route = result?.route;
  const remainingKm = routeProgress?.status === "onRoute"
    ? routeProgress.distanceRemainingKm
    : !started ? route?.distanceKm : undefined;

  function beginDrive() {
    setStarted(true);
    start();
  }

  function endDrive() {
    stop();
    setStarted(false);
    router.push("/");
  }

  if (!restored) return <DriveRestoreLoading />;
  if (!result) return <DriveEmptyState onCheckDrive={() => router.push("/")} onJustDrive={() => router.push("/just-drive")} />;

  return <><main className="page-shell"><header className="flex items-center justify-between"><div className="glass flex h-13 w-13 items-center justify-center rounded-full border-[#d48c6b]/30 text-[#d48c6b]"><Route size={20} /></div><div className="flex items-center gap-2 text-[9px] uppercase tracking-[.14em] text-[#77dcb3]"><span className={`h-1.5 w-1.5 rounded-full ${status === "active" ? "breathing bg-[#34d399]" : "bg-[#82908d]"}`} />{gpsLabel(started, status)}</div><button onClick={endDrive} aria-label="End drive mode" className="glass flex h-11 w-11 items-center justify-center rounded-[17px] text-[#9ca7a4]"><X size={19} /></button></header>

    <section className="mt-10 text-center"><div className="text-[10px] uppercase tracking-[.2em] text-[#7d8a87]">Driving to</div><div className="mt-3 text-[38px] font-light leading-tight tracking-[-0.055em]">{route?.destination.name ?? "No route loaded"}</div><div className="mt-2 text-[12px] text-[#8e9b98]">{remainingKm !== undefined ? `${remainingKm.toFixed(1)} km remaining` : route ? "Route progress paused" : "Run a route check before opening Drive Mode"}</div><div className="mx-auto mt-7 h-px w-[72%] bg-gradient-to-r from-transparent via-[#69a8a3]/40 to-transparent" /><div className="mt-5 text-[10px] uppercase tracking-[.13em] text-[#7d8a87]">GPS speed</div><div className="mt-1 text-[58px] font-light tracking-[-.06em]">{location?.speedKmh !== undefined ? Math.round(location.speedKmh) : "--"}<span className="ml-2 text-[12px] tracking-normal text-[#7d8a87]">km/h</span></div></section>

    <DriveStatusCard started={started} status={status} progressStatus={routeProgress?.status} primary={primary} />

    <div className="action-stack">{!started && <button disabled={!route} onClick={beginDrive} className="primary-button disabled:cursor-not-allowed disabled:opacity-40">Start Drive Mode <Play size={18} /></button>}<div className="grid grid-cols-2 gap-2.5"><button onClick={() => setMuted((value) => !value)} className="glass card flex items-center justify-center gap-2 py-4 text-[12px]">{muted ? <VolumeX size={17} className="text-[#d48c6b]" /> : <Volume2 size={17} className="text-[#69a8a3]" />}{muted ? "Unmute" : "Mute"}</button><button onClick={() => route && openMaps(route.origin.name, route.destination.name)} disabled={!route} className="glass card flex items-center justify-center gap-2 py-4 text-[12px] disabled:opacity-40"><Navigation size={17} className="text-[#69a8a3]" />Open Maps</button></div>{started && <button onClick={endDrive} className="glass flex w-full items-center justify-center gap-2 rounded-[22px] py-4 text-[12px] text-[#d8b09d]"><X size={16} />End drive</button>}</div>

    <section className="surface-panel section-block p-4 text-[10px] leading-5 text-[#7f8c89]">Web prototype: background GPS and spoken warnings may pause when your phone is locked or another app is in the foreground.</section><DataAttribution includeImo /></main><BottomNav /></>;
}

function DriveRestoreLoading() {
  return <><main className="page-shell"><div className="glass h-13 w-13 animate-pulse rounded-full" /><section className="glass card section-block-lg h-64 animate-pulse" aria-label="Restoring active drive" /></main><BottomNav /></>;
}

function DriveStatusCard({ started, status, progressStatus, primary }: {
  started: boolean;
  status: ReturnType<typeof useLiveLocation>["status"];
  progressStatus?: "onRoute" | "offRoute" | "poorAccuracy";
  primary?: ReturnType<typeof upcomingWarnings>[number];
}) {
  let title = "Ready for live Drive Mode";
  let detail = "Start when you are ready. Roadwise will request location access.";
  let icon = <LocateFixed size={22} />;
  if (started && status === "requesting") { title = "Waiting for location..."; detail = "Allow precise location when your browser asks."; }
  else if (status === "denied") { title = "Location access is required for live Drive Mode."; detail = "Enable location permission in your browser settings, then try again."; icon = <CloudOff size={22} />; }
  else if (status === "unavailable" || status === "error") { title = "Location is temporarily unavailable"; detail = "Keep official signs and instructions as your primary guide."; icon = <CloudOff size={22} />; }
  else if (progressStatus === "poorAccuracy") { title = "GPS accuracy is limited"; detail = "Waiting for a more precise position before updating route progress."; }
  else if (progressStatus === "offRoute") { title = "You're off the checked route."; detail = "Roadwise has paused exact hazard distances. Open Maps to review the route."; icon = <AlertTriangle size={22} />; }
  else if (primary) { title = primary.warning.title; detail = `${formatHazardDistance(primary.distanceToWarningKm)} · ${primary.warning.source}${primary.warning.roadName ? ` · ${primary.warning.roadName}` : ""}`; icon = <AlertTriangle size={22} />; }
  else if (started && status === "active") { title = "Nothing important ahead"; detail = "Roadwise is monitoring your route."; icon = <ShieldCheck size={22} />; }
  return <section className="glass card section-block-lg relative overflow-hidden border-[#7a3b2e]/25"><div className="topo-lines text-[#7a3b2e]" /><div className="relative flex items-start gap-4 p-5"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[#7a3b2e]/20 text-[#d48c6b]">{icon}</div><div className="min-w-0 flex-1"><div className="eyebrow">Live route monitor</div><div className="mt-1 text-[17px] font-semibold text-[#e8c4b0]">{title}</div><div className="mt-1 text-[11px] leading-5 text-[#8e9b98]">{detail}</div></div></div></section>;
}

function gpsLabel(started: boolean, status: ReturnType<typeof useLiveLocation>["status"]): string {
  if (!started) return "GPS off";
  if (status === "active") return "GPS live";
  if (status === "denied") return "GPS denied";
  return "GPS waiting";
}

function formatHazardDistance(distanceKm: number): string {
  return distanceKm < 1 ? `${Math.max(0, Math.round(distanceKm * 1_000))} m ahead` : `${distanceKm.toFixed(1)} km ahead`;
}

function openMaps(origin: string, destination: string): void {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  window.open(url, "_blank", "noopener,noreferrer");
}

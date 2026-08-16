"use client";

import { AlertTriangle, CloudOff, LocateFixed, Navigation, RefreshCw, Route, Search, ShieldAlert, ShieldCheck, Volume2, VolumeX, Wifi, WifiOff, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import BottomNav from "@/components/BottomNav";
import DataAttribution from "@/components/DataAttribution";
import DriveEmptyState from "@/components/DriveEmptyState";
import { useConnectivity } from "@/hooks/use-connectivity";
import { useLiveLocation } from "@/hooks/use-live-location";
import { useWarningAnnouncer } from "@/hooks/use-warning-announcer";
import { activeTripDataIsStale, officialTripDataAgeMinutes, savedTripAgeMinutes, savedTripClockTime } from "@/lib/offline-trip";
import { calculateRouteProgress, upcomingWarnings } from "@/lib/route-progress";
import { clearActiveTrip, persistActiveTripRefresh, readActiveTrip } from "@/lib/route-analysis-storage";
import type { ActiveTripState } from "@/lib/route-analysis-storage";
import type { AnalyseRouteResponse, RouteConditionsRefreshResponse } from "@/types/analysis";

type RefreshState = "idle" | "refreshing" | "updated" | "failed";

export default function DrivePage() {
  const router = useRouter();
  const [activeTrip, setActiveTrip] = useState<ActiveTripState>();
  const [restored, setRestored] = useState(false);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const { online } = useConnectivity();
  const { status, location, start, stop } = useLiveLocation();
  const activeTripRef = useRef<ActiveTripState | undefined>(undefined);
  const previousOnline = useRef(online);

  useEffect(() => {
    const stored = readActiveTrip();
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setActiveTrip(stored);
      activeTripRef.current = stored;
      setRestored(true);
      if (stored) {
        setStarted(true);
        start();
      }
    });
    return () => { active = false; };
  }, [start]);

  useEffect(() => {
    activeTripRef.current = activeTrip;
  }, [activeTrip]);

  useEffect(() => {
    const wasOnline = previousOnline.current;
    previousOnline.current = online;
    if (!online || wasOnline || !activeTripRef.current) return;
    const controller = new AbortController();
    const current = activeTripRef.current;
    setRefreshState("refreshing");
    void fetch("/api/analyse/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route: current.analysis.route.geometry, vehicle: current.analysis.vehicle }),
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json() as RouteConditionsRefreshResponse | { error?: string };
      if (!response.ok || !("analysis" in payload)) throw new Error("Refresh unavailable");
      const refreshed: AnalyseRouteResponse = {
        ...current.analysis,
        analysis: payload.analysis,
        sources: { ...current.analysis.sources, ...payload.sources },
        matches: payload.matches,
      };
      const persisted = persistActiveTripRefresh(current, refreshed);
      if (!persisted) throw new Error("Active trip changed while refreshing");
      activeTripRef.current = persisted;
      setActiveTrip(persisted);
      setRefreshState("updated");
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRefreshState("failed");
    });
    return () => controller.abort();
  }, [online]);

  const result = activeTrip?.analysis;

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

  function endDrive() {
    stop();
    clearActiveTrip();
    setStarted(false);
    router.push("/");
  }

  if (!restored) return <DriveRestoreLoading />;
  if (!result) return <DriveEmptyState onCheckDrive={() => router.push("/")} onJustDrive={() => router.push("/just-drive")} />;

  return <><main className="page-shell"><header className="flex items-center justify-between"><div className="glass flex h-13 w-13 items-center justify-center rounded-full border-[#d48c6b]/30 text-[#d48c6b]"><Route size={20} /></div><div className="flex items-center gap-2 text-[9px] uppercase tracking-[.14em] text-[#77dcb3]"><span className={`h-1.5 w-1.5 rounded-full ${status === "active" ? "breathing bg-[#34d399]" : "bg-[#82908d]"}`} />{gpsLabel(started, status)}</div><button onClick={endDrive} aria-label="End drive mode" className="glass flex h-11 w-11 items-center justify-center rounded-[17px] text-[#9ca7a4]"><X size={19} /></button></header>

    <ConnectivityState activeTrip={activeTrip!} online={online} refreshState={refreshState} />

    <section className="mt-10 text-center"><div className="text-[10px] uppercase tracking-[.2em] text-[#7d8a87]">Driving to</div><div className="mt-3 text-[38px] font-light leading-tight tracking-[-0.055em]">{route?.destination.name ?? "No route loaded"}</div><button type="button" onClick={() => router.push("/#destination-search")} className="motion-press mx-auto mt-3 flex min-h-11 items-center justify-center gap-2 rounded-[16px] px-4 text-[11px] font-semibold text-[#8fbab5]"><Search size={15} />Change destination</button><div className="mt-2 text-[12px] text-[#8e9b98]">{remainingKm !== undefined ? `${remainingKm.toFixed(1)} km remaining` : route ? "Route progress paused" : "Run a route check before opening Drive Mode"}</div><div className="mx-auto mt-7 h-px w-[72%] bg-gradient-to-r from-transparent via-[#69a8a3]/40 to-transparent" /><div className="mt-5 text-[10px] uppercase tracking-[.13em] text-[#7d8a87]">GPS speed</div><div className="mt-1 text-[58px] font-light tracking-[-.06em]"><span key={location?.speedKmh !== undefined ? Math.round(location.speedKmh) : "unknown"} className="motion-value tabular-nums">{location?.speedKmh !== undefined ? Math.round(location.speedKmh) : "--"}</span><span className="ml-2 text-[12px] tracking-normal text-[#7d8a87]">km/h</span></div></section>

    <DriveStatusCard started={started} status={status} progressStatus={routeProgress?.status} primary={primary} online={online} />

    <div className="action-stack"><div className="grid grid-cols-2 gap-2.5"><button onClick={() => setMuted((value) => !value)} className="motion-press glass card flex items-center justify-center gap-2 py-4 text-[12px]"><span key={String(muted)} className="motion-crossfade">{muted ? <VolumeX size={17} className="text-[#d48c6b]" /> : <Volume2 size={17} className="text-[#69a8a3]" />}</span>{muted ? "Unmute" : "Mute"}</button><button onClick={() => route && openMaps(route.origin.name, route.destination.name)} disabled={!route || !online} className="motion-press glass card flex items-center justify-center gap-2 py-4 text-[12px] disabled:opacity-40"><Navigation size={17} className="text-[#69a8a3]" />{online ? "Open Maps" : "Maps offline"}</button></div><Link prefetch href="/emergency" className="motion-press glass flex min-h-12 w-full items-center justify-center gap-2 rounded-[20px] text-[11px] font-semibold text-[#c2cac7]"><ShieldAlert size={16} className="text-[#d48c6b]" />Emergency guidance · 112</Link>{started && <button onClick={endDrive} className="motion-press glass flex w-full items-center justify-center gap-2 rounded-[22px] py-4 text-[12px] text-[#d8b09d]"><X size={16} />End drive</button>}</div>

    <section className="surface-panel section-block p-4 text-[10px] leading-5 text-[#7f8c89]">Browser limitation: background GPS and spoken warnings may pause when your phone is locked or another app is in the foreground.</section><DataAttribution includeImo /></main><BottomNav /></>;
}

function DriveRestoreLoading() {
  return <><main className="page-shell"><div className="motion-skeleton glass h-13 w-13 rounded-full" /><section className="motion-skeleton glass card section-block-lg h-64" aria-label="Restoring active drive" /></main><BottomNav /></>;
}

function DriveStatusCard({ started, status, progressStatus, primary, online }: {
  started: boolean;
  status: ReturnType<typeof useLiveLocation>["status"];
  progressStatus?: "onRoute" | "offRoute" | "poorAccuracy";
  primary?: ReturnType<typeof upcomingWarnings>[number];
  online: boolean;
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
  else if (started && status === "active") { title = "Nothing important ahead"; detail = online ? "Roadwise is monitoring your route." : "Roadwise is monitoring your saved route data."; icon = <ShieldCheck size={22} />; }
  const stateKey = primary?.warning.id ?? `${started}-${status}-${progressStatus ?? "idle"}`;
  const critical = primary?.warning.severity === "closed" || primary?.warning.severity === "difficult";
  return <section className={`glass card section-block-lg relative overflow-hidden border-[#7a3b2e]/25 ${critical ? "motion-critical-once" : ""}`}><div className="topo-lines text-[#7a3b2e]" /><div key={stateKey} className="motion-crossfade relative flex items-start gap-4 p-5"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[#7a3b2e]/20 text-[#d48c6b]">{icon}</div><div className="min-w-0 flex-1"><div className="eyebrow">{online ? "Route monitor" : "Saved route monitor"}</div><div className="mt-1 text-[17px] font-semibold text-[#e8c4b0]">{title}</div><div className="mt-1 text-[11px] leading-5 text-[#8e9b98]">{detail}</div></div></div></section>;
}

function ConnectivityState({ activeTrip, online, refreshState }: { activeTrip: ActiveTripState; online: boolean; refreshState: RefreshState }) {
  const savedAge = savedTripAgeMinutes(activeTrip);
  const officialAge = officialTripDataAgeMinutes(activeTrip);
  const stale = activeTripDataIsStale(activeTrip);
  const savedDetail = `Data saved at ${savedTripClockTime(activeTrip)} · official conditions ${ageLabel(officialAge)}`;
  let title = "Connected";
  let detail = savedDetail;
  let icon = <Wifi size={16} />;
  if (!online) {
    title = "Offline";
    detail = `Using data saved at ${savedTripClockTime(activeTrip)} · ${ageLabel(savedAge)}`;
    icon = <WifiOff size={16} />;
  } else if (refreshState === "refreshing") {
    title = "Connection restored";
    detail = "Refreshing official route conditions in the background…";
    icon = <RefreshCw size={16} className="animate-spin" />;
  } else if (refreshState === "failed") {
    title = "Connected · saved data";
    detail = `Refresh unavailable. ${savedDetail}`;
  } else if (refreshState === "updated") {
    title = "Official data refreshed";
    detail = "Official route conditions refreshed just now.";
  }
  return <section className={`motion-crossfade mt-3 rounded-[18px] border px-3.5 py-3 ${online && refreshState !== "failed" ? "border-[#34d399]/12 bg-[#34d399]/[.035]" : "border-white/[.07] bg-white/[.025]"}`} aria-live="polite"><div className="flex items-center gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] ${online && refreshState !== "failed" ? "bg-[#2d6b6b]/18 text-[#69a8a3]" : "bg-white/[.04] text-[#8e9b98]"}`}>{icon}</span><div className="min-w-0"><div className="text-[11px] font-semibold text-[#c3cecb]">{title}</div><div className="mt-0.5 text-[9px] leading-4 text-[#7f8c89]">{detail}</div></div></div>{!online && stale ? <p className="mt-2 border-t border-white/[.06] pt-2 text-[9px] leading-4 text-[#d8b09d]">Saved official conditions are old. Continue to follow current signs and instructions.</p> : null}</section>;
}

function ageLabel(minutes: number): string {
  if (minutes < 1) return "updated just now";
  if (minutes < 60) return `updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `updated ${hours} hr ${minutes % 60} min ago`;
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

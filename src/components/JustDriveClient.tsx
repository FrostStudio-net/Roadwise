"use client";

import distance from "@turf/distance";
import { point } from "@turf/helpers";
import {
  AlertTriangle,
  CloudOff,
  LocateFixed,
  Navigation,
  Play,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import BottomNav from "@/components/BottomNav";
import DataAttribution from "@/components/DataAttribution";
import VehicleSelector from "@/components/VehicleSelector";
import { useLiveLocation } from "@/hooks/use-live-location";
import { useWarningAnnouncer } from "@/hooks/use-warning-announcer";
import { ROUTE_PROGRESS_CONFIG } from "@/lib/route-progress";
import type { VehicleType } from "@/types/analysis";
import type { MonitorResponse } from "@/types/monitor";
import type { Coordinates } from "@/types/road";

export const JUST_DRIVE_REQUEST_CONFIG = {
  minimumIntervalMs: 15_000,
  maximumIntervalMs: 45_000,
  minimumMovementMeters: 150,
} as const;

type LastRequest = { coordinates: Coordinates; sentAt: number };

export default function JustDriveClient({ initialVehicle }: { initialVehicle: VehicleType }) {
  const router = useRouter();
  const [vehicle, setVehicle] = useState<VehicleType>(initialVehicle);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [monitor, setMonitor] = useState<MonitorResponse>();
  const [monitorError, setMonitorError] = useState<string>();
  const [checking, setChecking] = useState(false);
  const { status, location, start, stop } = useLiveLocation();
  const lastRequest = useRef<LastRequest | undefined>(undefined);
  const pendingRequest = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    if (!started || status !== "active" || !location) return;
    if (location.accuracyMeters > ROUTE_PROGRESS_CONFIG.gpsAccuracyThresholdMeters) return;

    const now = Date.now();
    const previous = lastRequest.current;
    if (previous) {
      const elapsed = now - previous.sentAt;
      const movementMeters = distance(point(previous.coordinates), point(location.coordinates), { units: "kilometers" }) * 1_000;
      if (elapsed < JUST_DRIVE_REQUEST_CONFIG.minimumIntervalMs) return;
      if (movementMeters < JUST_DRIVE_REQUEST_CONFIG.minimumMovementMeters
        && elapsed < JUST_DRIVE_REQUEST_CONFIG.maximumIntervalMs) return;
    }

    pendingRequest.current?.abort();
    const controller = new AbortController();
    pendingRequest.current = controller;
    lastRequest.current = { coordinates: location.coordinates, sentAt: now };
    setChecking(true);
    setMonitorError(undefined);
    fetch("/api/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        latitude: location.coordinates[1],
        longitude: location.coordinates[0],
        accuracy: location.accuracyMeters,
        heading: location.headingDegrees,
        speedKmh: location.speedKmh,
        timestamp: location.timestamp,
        vehicle,
      }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Monitor request failed");
        return response.json() as Promise<MonitorResponse>;
      })
      .then((response) => setMonitor(response))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMonitorError("Live hazard monitoring is temporarily unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
  }, [location, started, status, vehicle]);

  useEffect(() => () => pendingRequest.current?.abort(), []);

  const upcoming = useMemo(() => (monitor?.warnings ?? []).flatMap((warning) => warning.distanceAheadKm === undefined
    ? []
    : [{ warning, distanceToWarningKm: warning.distanceAheadKm }]), [monitor]);
  useWarningAnnouncer(upcoming, started && status === "active" && Boolean(monitor?.headingReliable), muted);

  const primary = monitor?.warnings[0];
  const accurateLocation = location
    && location.accuracyMeters <= ROUTE_PROGRESS_CONFIG.gpsAccuracyThresholdMeters
    ? location
    : undefined;

  function begin() {
    lastRequest.current = undefined;
    setMonitor(undefined);
    setMonitorError(undefined);
    setStarted(true);
    start();
  }

  function end() {
    pendingRequest.current?.abort();
    stop();
    setStarted(false);
    router.push("/");
  }

  return (
    <>
      <main className="page-shell">
        <header className="flex items-center justify-between">
          <div className="glass flex h-13 w-13 items-center justify-center rounded-full border-[#69a8a3]/30 text-[#69a8a3]">
            <Navigation size={20} />
          </div>
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-[.14em] text-[#77dcb3]">
            <span className={`h-1.5 w-1.5 rounded-full ${status === "active" && accurateLocation ? "breathing bg-[#34d399]" : "bg-[#82908d]"}`} />
            {gpsLabel(started, status, Boolean(accurateLocation))}
          </div>
          <button onClick={end} aria-label="Close Just Drive" className="glass flex h-11 w-11 items-center justify-center rounded-[17px] text-[#9ca7a4]">
            <X size={19} />
          </button>
        </header>

        <section className="section-block-lg text-center">
          <div className="eyebrow">Just Drive</div>
          <h1 className="mt-3 text-[34px] font-semibold leading-[1.08] tracking-[-0.052em]">
            {started ? (monitor?.headingReliable === false ? "Monitoring nearby" : "Monitoring ahead") : "Roadwise will monitor the road ahead."}
          </h1>
          <p className="mx-auto mt-4 max-w-[350px] text-[13px] leading-6 text-[#95a19e]">
            {started
              ? "Current official road conditions and incidents, filtered around your direction of travel."
              : "Roadwise monitors the road ahead even when you haven't planned a destination."}
          </p>
          <div className="mx-auto mt-7 h-px w-[72%] bg-gradient-to-r from-transparent via-[#69a8a3]/40 to-transparent" />
          <div className="mt-5 text-[10px] uppercase tracking-[.13em] text-[#7d8a87]">GPS speed</div>
          <div className="mt-1 text-[58px] font-light tracking-[-.06em]">
            {accurateLocation?.speedKmh !== undefined ? Math.round(accurateLocation.speedKmh) : "--"}
            <span className="ml-2 text-[12px] tracking-normal text-[#7d8a87]">km/h</span>
          </div>
        </section>

        <MonitorCard
          started={started}
          status={status}
          accuracyMeters={location?.accuracyMeters}
          checking={checking}
          monitor={monitor}
          monitorError={monitorError}
          primary={primary}
        />

        <div className="action-stack">
          {!started ? (
            <>
              <VehicleSelector vehicle={vehicle} onChange={setVehicle} />
              <button onClick={begin} className="primary-button">Start Just Drive <Play size={18} /></button>
            </>
          ) : (
            <>
              <button onClick={() => setMuted((value) => !value)} className="glass card flex w-full items-center justify-center gap-2 py-4 text-[12px]">
                {muted ? <VolumeX size={17} className="text-[#d48c6b]" /> : <Volume2 size={17} className="text-[#69a8a3]" />}
                {muted ? "Unmute" : "Mute"}
              </button>
              <button onClick={end} className="glass flex w-full items-center justify-center gap-2 rounded-[22px] py-4 text-[12px] text-[#d8b09d]">
                <X size={16} />End Just Drive
              </button>
            </>
          )}
        </div>

        <section className="surface-panel section-block p-4 text-[10px] leading-5 text-[#7f8c89]">
          Browser limitation: background GPS, monitoring requests and spoken warnings may pause when your phone is locked or another app is in the foreground.
        </section>
        <DataAttribution />
      </main>
      <BottomNav />
    </>
  );
}

function MonitorCard({ started, status, accuracyMeters, checking, monitor, monitorError, primary }: {
  started: boolean;
  status: ReturnType<typeof useLiveLocation>["status"];
  accuracyMeters?: number;
  checking: boolean;
  monitor?: MonitorResponse;
  monitorError?: string;
  primary?: MonitorResponse["warnings"][number];
}) {
  let title = "Ready when you are";
  let detail = "Start Just Drive to request precise location access.";
  let icon = <LocateFixed size={22} />;

  if (started && status === "requesting") {
    title = "Waiting for location...";
    detail = "Allow precise location when your browser asks.";
  } else if (status === "denied") {
    title = "Location access is required for Just Drive.";
    detail = "Enable precise location in your browser settings, then start again.";
    icon = <CloudOff size={22} />;
  } else if (status === "unavailable" || status === "error") {
    title = "Location is temporarily unavailable";
    detail = "Keep official signs and instructions as your primary guide.";
    icon = <CloudOff size={22} />;
  } else if (started && accuracyMeters !== undefined && accuracyMeters > ROUTE_PROGRESS_CONFIG.gpsAccuracyThresholdMeters) {
    title = "Waiting for a better GPS signal.";
    detail = `Current accuracy is approximately ${Math.round(accuracyMeters)} metres.`;
  } else if (monitorError) {
    title = "Live monitoring is temporarily unavailable";
    detail = monitorError;
    icon = <CloudOff size={22} />;
  } else if (monitor && !monitor.source.available) {
    title = "Official road data is temporarily unavailable";
    detail = "Check Umferðin and follow official signs before continuing.";
    icon = <CloudOff size={22} />;
  } else if (primary) {
    title = primary.title;
    detail = monitor?.headingReliable
      ? `${formatHazardDistance(primary.distanceAheadKm)} · ${warningSource(primary)}`
      : `Nearby report · ${warningSource(primary)}`;
    icon = <AlertTriangle size={22} />;
  } else if (started && monitor) {
    title = monitor.headingReliable ? "Nothing important ahead" : "Nothing important nearby";
    detail = monitor.headingReliable
      ? "Roadwise is monitoring nearby roads."
      : "Heading is uncertain, so Roadwise is using a smaller nearby area.";
    icon = <ShieldCheck size={22} />;
  } else if (started && checking) {
    title = "Monitoring ahead";
    detail = "Checking cached official road data.";
  }

  return (
    <section className="glass card section-block-lg relative overflow-hidden border-[#7a3b2e]/25" aria-live="polite">
      <div className="topo-lines text-[#7a3b2e]" />
      <div className="relative flex items-start gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[#7a3b2e]/20 text-[#d48c6b]">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{monitor?.headingReliable === false ? "Nearby monitor" : "Forward monitor"}</div>
          <div className="mt-1 text-[17px] font-semibold text-[#e8c4b0]">{title}</div>
          <div className="mt-1 text-[11px] leading-5 text-[#8e9b98]">{detail}</div>
          {monitor?.source.stale ? <div className="mt-2 text-[9px] uppercase tracking-[.08em] text-[#d9a68d]">Official source update is older than {monitor.source.staleAfterMinutes} minutes</div> : null}
          {monitor?.source.available && monitor.source.error ? <div className="mt-2 text-[9px] leading-4 text-[#d9a68d]">Partial official data: {monitor.source.error}. Related hazards may be omitted.</div> : null}
        </div>
      </div>
    </section>
  );
}

function gpsLabel(started: boolean, status: ReturnType<typeof useLiveLocation>["status"], accurate: boolean): string {
  if (!started) return "GPS off";
  if (status === "denied") return "GPS denied";
  if (status === "active" && accurate) return "GPS live";
  if (status === "active") return "GPS weak";
  return "GPS waiting";
}

function formatHazardDistance(value?: number): string {
  if (value === undefined) return "Distance unavailable";
  return value < 1 ? `${Math.max(0, Math.round(value * 1_000))} m ahead` : `${value.toFixed(1)} km ahead`;
}

function warningSource(warning: MonitorResponse["warnings"][number]): string {
  return [warning.source, warning.roadNumber, warning.roadName].filter(Boolean).join(" · ");
}

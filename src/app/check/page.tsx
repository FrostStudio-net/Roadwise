"use client";

import { ArrowLeft, ArrowUpRight, CloudOff, Map, Navigation, ShieldAlert } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import BottomNav from "@/components/BottomNav";
import DataAttribution from "@/components/DataAttribution";
import VehicleSelector from "@/components/VehicleSelector";
import { readDestinationSelection } from "@/lib/destination-selection-storage";
import { storeRouteAnalysis } from "@/lib/route-analysis-storage";
import type { AnalyseRouteResponse, AnalysisDebugRecord, RouteWarning, VehicleType } from "@/types/analysis";

type AnalyseErrorResponse = {
  error?: { message?: string };
};

type AnalyseRequest = {
  origin: string;
  destination: string;
  vehicle: VehicleType;
  destinationSelection: ReturnType<typeof readDestinationSelection>;
};

const ANALYSIS_REQUEST_TTL_MS = 60_000;
const analysisRequests = new globalThis.Map<string, { expiresAt: number; promise: Promise<AnalyseRouteResponse> }>();

function requestAnalysis(body: AnalyseRequest): Promise<AnalyseRouteResponse> {
  const key = JSON.stringify(body);
  const existing = analysisRequests.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.promise;
  const promise = fetch("/api/analyse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: key,
  }).then(async (response) => {
    const data = await response.json() as AnalyseRouteResponse | AnalyseErrorResponse;
    if (!response.ok) {
      const failure = data as AnalyseErrorResponse;
      throw new Error(failure.error?.message ?? "Route analysis is currently unavailable");
    }
    return data as AnalyseRouteResponse;
  }).catch((error: unknown) => {
    analysisRequests.delete(key);
    throw error;
  });
  analysisRequests.set(key, { expiresAt: Date.now() + ANALYSIS_REQUEST_TTL_MS, promise });
  return promise;
}

export default function CheckPage() {
  return <Suspense fallback={<CheckLoading />}><CheckContent /></Suspense>;
}

function CheckContent() {
  const router = useRouter();
  const params = useSearchParams();
  const destination = params.get("destination") || "Vík";
  const destinationId = params.get("destinationId");
  const initialVehicle = (params.get("vehicle") as VehicleType | null) ?? "Small car (2WD)";
  const [vehicle, setVehicle] = useState<VehicleType>(initialVehicle);
  const [result, setResult] = useState<AnalyseRouteResponse>();
  const [loading, setLoading] = useState(true);
  const [requestError, setRequestError] = useState<string>();

  useEffect(() => {
    let active = true;
    requestAnalysis({ origin: "Reykjavík", destination, vehicle, destinationSelection: readDestinationSelection(destinationId) })
      .then((data) => {
        if (!active) return;
        setResult(data);
        setRequestError(undefined);
        storeRouteAnalysis(data);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setResult(undefined);
        setRequestError(error instanceof Error ? error.message : "Route analysis is currently unavailable");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [destination, destinationId, vehicle]);

  const route = result?.route;
  const analysis = result?.analysis;
  const roadDataUnavailable = analysis && !analysis.available;

  return (
    <>
      <main className="page-shell">
        <header className="flex items-center justify-between">
          <button onClick={() => router.back()} aria-label="Go back" className="glass flex h-11 w-11 items-center justify-center rounded-[17px] text-[#b5bfbc]"><ArrowLeft size={19} /></button>
          <span className="eyebrow">Route check</span><span className="w-11" />
        </header>

        <section className="section-block-lg">
          <div className="text-[12px] text-[#8e9b98]">From {route?.origin.name ?? "Reykjavík"}</div>
          <h1 className="mt-1 text-[35px] font-semibold tracking-[-0.055em]">To {route?.destination.name ?? destination}</h1>
          {route && <div className="mt-2 text-[11px] uppercase tracking-[.12em] text-[#778581]">{route.distanceKm.toLocaleString()} km · {formatDuration(route.durationMinutes)}</div>}
        </section>

        {loading ? (
          <AnalysisLoading />
        ) : requestError || !analysis ? (
          <section className="glass card section-block p-6">
            <CloudOff size={27} className="text-[#d48c6b]" /><h2 className="mt-4 text-[21px] font-semibold text-[#e8c4b0]">Route check unavailable</h2><p className="mt-3 text-[13px] leading-6 text-[#a5afac]">{requestError ?? "Route analysis is currently unavailable. Please try again."}</p>
          </section>
        ) : roadDataUnavailable ? (
          <section className="glass card section-block p-6">
            <CloudOff size={27} className="text-[#d48c6b]" /><h2 className="mt-4 text-[21px] font-semibold text-[#e8c4b0]">Live data unavailable</h2><p className="mt-3 text-[13px] leading-6 text-[#a5afac]">Live road data is currently unavailable. Check Umferðin and official sources before driving.</p>
          </section>
        ) : (
          <>
            <section className="glass card relative section-block overflow-hidden p-6">
              <div className="topo-lines text-[#d48c6b]" />
              <div className="relative flex items-start gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[21px] border border-[#d48c6b]/20 bg-[#d48c6b]/10 text-[#d48c6b]"><ShieldAlert size={27} strokeWidth={1.5} /></div><div><div className="eyebrow">Official-data verdict</div><h2 className="mt-2 text-[23px] font-semibold leading-tight tracking-[-.035em] text-[#e8c4b0]">{analysis.title}</h2></div></div>
              <p className="relative mt-5 max-w-[350px] text-[13px] leading-6 text-[#a5afac]">{analysis.summary}</p>
            </section>

            <section className="section-block"><div className="eyebrow section-label">What’s reported</div><div className="surface-group">
              {analysis.warnings.length > 0 ? analysis.warnings.map((warning) => <HazardCard key={warning.id} warning={warning} />) : <div className="px-2 py-4 text-[12px] leading-5 text-[#9aa6a2]">No significant route hazards were reported by the available official sources. Conditions can change.</div>}
            </div></section>

            <section className="surface-panel section-block flex items-center gap-3 border-[#34d399]/10 bg-[#34d399]/[0.035] p-4"><span className="breathing h-2 w-2 shrink-0 rounded-full bg-[#34d399]" /><div><div className="text-[10px] uppercase tracking-[.14em] text-[#70cba7]">Source freshness</div><div className="mt-1 text-[12px] text-[#a8b2af]">{formatRoadDataFreshness(result)}</div>{result.sources.roadDataStale && <div className="mt-1 text-[10px] text-[#d48c6b]">Road data may be stale. Confirm with official sources.</div>}</div></section>
            {!result.sources.imo.available && <div className="section-block px-1 text-[11px] leading-5 text-[#8e9b98]">Weather warning data temporarily unavailable.</div>}
            {process.env.NODE_ENV === "development" && result.debug && <WhyResult analysis={analysis} records={result.debug.matchedRecords} />}
          </>
        )}

        {route && <div className="action-stack"><button onClick={() => router.push("/drive")} className="primary-button">Open drive mode <ArrowUpRight size={19} /></button><button onClick={() => openMaps(route.origin.name, route.destination.name)} className="glass flex w-full items-center justify-center gap-2 rounded-[22px] px-5 py-[15px] text-[13px] text-[#c2cac7]"><Navigation size={16} className="text-[#d48c6b]" />Open in Maps</button></div>}
        <div className="section-block"><VehicleSelector vehicle={vehicle} onChange={(value) => { setLoading(true); setRequestError(undefined); setVehicle(value); }} /></div>
        <DataAttribution includeImo />
      </main><BottomNav />
    </>
  );
}

const LOADING_STAGES = [
  "Finding your route",
  "Checking Icelandic roads",
  "Checking live conditions",
  "Preparing your drive",
] as const;

function AnalysisLoading() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timers = [900, 2_100, 3_400].map((delay, index) => window.setTimeout(() => setStage(index + 1), delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);
  return <section className="glass card section-block flex min-h-52 items-center justify-center p-6 text-center"><div><span className="breathing mx-auto block h-2 w-2 rounded-full bg-[#d48c6b]" /><h2 className="mt-4 text-[18px] font-semibold">{LOADING_STAGES[stage]}</h2><p className="mt-2 text-[12px] text-[#8e9b98]">Road and weather checks run together</p></div></section>;
}

function CheckLoading() {
  return <main className="page-shell"><div className="glass h-11 w-11 animate-pulse rounded-[17px]" /><div className="mt-9 h-4 w-28 animate-pulse rounded-full bg-white/[.06]" /><div className="mt-3 h-10 w-56 animate-pulse rounded-2xl bg-white/[.07]" /><div className="glass card mt-7 h-52 animate-pulse" /></main>;
}

function HazardCard({ warning }: { warning: RouteWarning }) {
  const style = warning.severity === "closed" || warning.severity === "difficult" ? "text-[#d48c6b] bg-[#7a3b2e]/20" : "text-[#e8c4b0] bg-[#d48c6b]/[0.08]";
  const distance = warning.distanceAheadKm !== undefined ? `${warning.distanceAheadKm.toFixed(1)} km ahead · ` : "";
  return <div className="surface-row flex items-center gap-3 px-1 py-3.5"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[17px] ${style}`}><Map size={19} /></div><div className="min-w-0 flex-1"><div className="text-[13px] font-semibold">{warning.title}</div><div className="mt-1 text-[9px] uppercase tracking-[.08em] text-[#82908d]">{distance}{warning.source}</div><div className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#82908d]">{warning.description}</div></div></div>;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours} hr ${remainder} min` : `${remainder} min`;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Atlantic/Reykjavik" }).format(new Date(value));
}

function formatRoadDataFreshness(result: AnalyseRouteResponse): string {
  const minutes = result.sources.roadDataAgeMinutes;
  if (minutes !== undefined) {
    if (minutes < 1) return "Road data updated just now";
    if (minutes < 60) return `Road data updated ${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `Road data updated ${hours} hr ${minutes % 60} min ago`;
  }
  return result.sources.roadDataUpdatedAt
    ? `Road data updated ${formatTimestamp(result.sources.roadDataUpdatedAt)}`
    : "Road data checked; update time unavailable";
}

function WhyResult({ analysis, records }: { analysis: AnalyseRouteResponse["analysis"]; records: AnalysisDebugRecord[] }) {
  const triggers = analysis.warnings.filter((warning) => warning.affectsOverallLevel);
  return <details className="surface-panel section-block p-4 text-[11px] text-[#9aa6a2]"><summary className="cursor-pointer text-[12px] font-semibold text-[#c2cac7]">Why this result?</summary><div className="mt-4 space-y-4"><div><div className="eyebrow">Overall: {analysis.level.toUpperCase()}</div><div className="mt-2">Triggered by:</div>{triggers.length > 0 ? triggers.map((warning) => <DebugTrigger key={warning.id} warning={warning} />) : <div className="mt-1">No relevant hazard</div>}</div><div className="eyebrow pt-2">All matched road records</div>{records.map((record) => <DebugRecord key={`${record.kind}-${record.sourceRecordId}`} record={record} />)}</div></details>;
}

function DebugTrigger({ warning }: { warning: RouteWarning }) {
  return <div className="mt-2 border-l border-[#d48c6b]/20 pl-3 leading-5"><div className="font-semibold text-[#d6ddda]">{warning.title}: {warning.officialCondition ?? warning.type}</div><div>Road: {[warning.roadNumber, warning.roadName].filter(Boolean).join(" · ") || "Not supplied"}</div>{warning.matchedSectionId && <div>Section: {warning.matchedSectionId}</div>}<div>Distance from selected route: {warning.distanceFromRouteMeters !== undefined ? `${warning.distanceFromRouteMeters} m` : "Unknown"}</div><div>Source: {warning.source}</div><div>Record ID: {warning.sourceRecordId ?? warning.id}</div>{warning.updatedAt && <div>Updated: {formatTimestamp(warning.updatedAt)}</div>}</div>;
}

function DebugRecord({ record }: { record: AnalysisDebugRecord }) {
  return <div className="border-t border-white/[.06] pt-3"><div className="font-semibold text-[#d6ddda]">{record.title} · {record.type}</div><div className="mt-2 space-y-1 leading-5"><div>Official status: {record.officialStatus}</div><div>Road/location: {[record.roadNumber, record.roadName].filter(Boolean).join(" · ") || "Not supplied"}</div><div>Distance from route: {record.distanceFromRouteMeters !== undefined ? `${record.distanceFromRouteMeters} m` : "Unknown"}</div><div>Distance ahead: {record.distanceAheadKm !== undefined ? `${record.distanceAheadKm.toFixed(1)} km` : "Unknown"}</div><div>Source: {record.source}</div><div>Record ID: {record.sourceRecordId}</div>{record.matchedSectionId && <div>Section: {record.matchedSectionId}</div>}{record.officialComment && <div>Official comment: {record.officialComment}</div>}{record.updatedAt && <div>Updated: {formatTimestamp(record.updatedAt)}</div>}</div></div>;
}

function openMaps(origin: string, destination: string): void {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  window.open(url, "_blank", "noopener,noreferrer");
}

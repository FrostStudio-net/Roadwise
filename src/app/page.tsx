"use client";

import { Crosshair, Fuel, Map, MountainSnow, Navigation, Route, ShieldAlert, Wind, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import BottomNav from "@/components/BottomNav";
import ConditionCard from "@/components/ConditionCard";
import DestinationAutocomplete from "@/components/DestinationAutocomplete";
import Logo from "@/components/Logo";
import VehicleSelector from "@/components/VehicleSelector";
import { useCurrentLocation } from "@/hooks/use-current-location";
import { clearDestinationSelection, storeDestinationSelection } from "@/lib/destination-selection-storage";
import { resolveHomeConditionCards } from "@/lib/home-condition-cards";
import { clearCheckedRoute, readActiveTrip, readCheckedRoute } from "@/lib/route-analysis-storage";
import type { AnalyseRouteResponse, GeocodedPlace, VehicleType } from "@/types/analysis";
import type { NearbyConditionsResponse } from "@/types/nearby";

export default function HomePage() {
  const router = useRouter();
  const [destination, setDestination] = useState("");
  const [selectedDestination, setSelectedDestination] = useState<GeocodedPlace>();
  const [vehicle, setVehicle] = useState<VehicleType>("Small car (2WD)");
  const [checking, setChecking] = useState(false);
  const [navigationError, setNavigationError] = useState<string>();
  const [destinationInteractionActive, setDestinationInteractionActive] = useState(false);
  const [routeState, setRouteState] = useState<{ restored: boolean; checked?: AnalyseRouteResponse; active?: AnalyseRouteResponse }>({ restored: false });
  const [nearby, setNearby] = useState<NearbyConditionsResponse>();
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState(false);
  const navigationPending = useRef(false);
  const routeContext = routeState.active ?? routeState.checked;
  const currentLocation = useCurrentLocation(routeState.restored && !routeContext);

  useEffect(() => {
    let active = true;
    function restoreRoute() {
      const checked = readCheckedRoute();
      const activeTrip = readActiveTrip();
      if (!active) return;
      setRouteState({ restored: true, checked, active: activeTrip });
      if (activeTrip ?? checked) setVehicle((activeTrip ?? checked)!.vehicle);
    }
    queueMicrotask(restoreRoute);
    function restoreWhenVisible() {
      if (document.visibilityState === "visible") restoreRoute();
    }
    document.addEventListener("visibilitychange", restoreWhenVisible);
    window.addEventListener("focus", restoreRoute);
    window.addEventListener("pageshow", restoreRoute);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", restoreWhenVisible);
      window.removeEventListener("focus", restoreRoute);
      window.removeEventListener("pageshow", restoreRoute);
    };
  }, []);

  useEffect(() => {
    if (routeContext || currentLocation.status !== "available" || !currentLocation.location) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setNearbyLoading(true);
        setNearbyError(false);
      }
    });
    fetch("/api/nearby", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: currentLocation.location.coordinates[1],
        longitude: currentLocation.location.coordinates[0],
        vehicle,
      }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Nearby conditions unavailable");
      return response.json() as Promise<NearbyConditionsResponse>;
    }).then((result) => {
      setNearby(result);
      setNearbyError(false);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNearby(undefined);
      setNearbyError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setNearbyLoading(false);
    });
    return () => controller.abort();
  }, [currentLocation.location, currentLocation.status, routeContext, vehicle]);

  const conditionCards = useMemo(() => resolveHomeConditionCards({
    route: routeContext,
    routeContext: routeState.active ? "active" : routeState.checked ? "checked" : undefined,
    nearby,
    locationStatus: currentLocation.status,
    nearbyLoading: nearbyLoading || !routeState.restored,
    nearbyUnavailable: nearbyError,
  }), [currentLocation.status, nearby, nearbyError, nearbyLoading, routeContext, routeState.active, routeState.checked, routeState.restored]);
  const conditionStateKey = routeContext
    ? `${routeState.active ? "active" : "checked"}-${routeContext.route.destination.name}-${routeContext.analysis.level}`
    : nearby
      ? `nearby-${nearby.generatedAt}`
      : `${currentLocation.status}-${nearbyLoading}-${nearbyError}`;

  function clearRouteContext() {
    clearCheckedRoute();
    setRouteState((current) => ({ ...current, checked: undefined }));
  }

  function navigateToCheck(place?: GeocodedPlace) {
    if (navigationPending.current) return;
    const selected = place ?? selectedDestination;
    const destinationName = (selected?.name ?? destination).trim();
    if (!destinationName) {
      setNavigationError("Enter a destination before checking this drive.");
      return;
    }
    navigationPending.current = true;
    setChecking(true);
    setNavigationError(undefined);
    const params = new URLSearchParams({ destination: destinationName, vehicle });
    if (selected?.mapboxId) params.set("destinationId", selected.mapboxId);
    try {
      router.push(`/check?${params.toString()}`);
    } catch (error) {
      navigationPending.current = false;
      setChecking(false);
      setNavigationError("Couldn’t open the route check. Please try again.");
      throw error;
    }
    window.setTimeout(() => {
      navigationPending.current = false;
      setChecking(false);
    }, 2_000);
  }

  function checkDrive() {
    try {
      navigateToCheck();
    } catch {
      // The inline error set by navigateToCheck keeps the typed fallback recoverable.
    }
  }

  return (
    <>
      <main className="page-shell">
        <header className="flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2 rounded-full border border-[#34d399]/15 bg-[#34d399]/[0.06] px-3 py-2 text-[10px] font-medium text-[#75dfb4]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" /> Official sources
          </div>
        </header>

        <section className="float-in section-block-lg">
          <div className="eyebrow">Official data · Route by route</div>
          <h1 className="mt-3 max-w-[360px] text-[34px] font-semibold leading-[1.06] tracking-[-0.052em]">Know the road.<br /><span className="text-[#9eaaa7]">Before it has opinions.</span></h1>
          <p className="mt-4 max-w-[340px] text-[13px] leading-6 text-[#95a19e]">Check a specific drive against current official road conditions, incidents and roadside measurements.</p>
        </section>

        <section key={conditionStateKey} className="motion-stagger section-block grid grid-cols-3 gap-2" aria-label="Current conditions" aria-live="polite">
          <ConditionCard icon={<Wind size={18} strokeWidth={1.6} />} label="Nearby wind" {...conditionCards.wind} />
          <ConditionCard icon={<Navigation size={18} strokeWidth={1.6} />} label="Roads" {...conditionCards.roads} />
          <ConditionCard icon={<ShieldAlert size={18} strokeWidth={1.6} />} label="Advisories" {...conditionCards.advisories} />
        </section>

        {routeContext ? <RouteContextBanner destination={routeContext.route.destination.name} active={Boolean(routeState.active)} onClear={clearRouteContext} /> : null}

        {!routeContext ? <HomeLocationPrompt status={currentLocation.status} accuracyMeters={currentLocation.location?.accuracyMeters} onUseLocation={currentLocation.request} onDismiss={currentLocation.dismiss} onRefresh={currentLocation.request} /> : null}

        <section id="destination-search" className="section-block-lg scroll-mt-6">
          <div className="mb-3 flex items-end justify-between"><div><div className="eyebrow">Plan ahead</div><h2 className="mt-1 text-lg font-semibold tracking-[-0.025em]">Where to?</h2></div><span className="text-[10px] text-[#7f8c89]">From Reykjavík</span></div>
          <DestinationAutocomplete value={destination} onValueChange={(value) => { setDestination(value); setSelectedDestination(undefined); setNavigationError(undefined); clearDestinationSelection(); }} onSelect={(place) => { setDestinationInteractionActive(false); setDestination(place.name); setSelectedDestination(place); storeDestinationSelection(place); navigateToCheck(place); }} onSubmit={checkDrive} disabled={checking} error={navigationError} onInteractionChange={setDestinationInteractionActive} />
          <button onClick={() => router.push(`/just-drive?vehicle=${encodeURIComponent(vehicle)}`)} className="motion-press glass mt-2 flex w-full items-center gap-3 rounded-[22px] px-4 py-3.5 text-left hover:bg-white/[.045]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-[#2d6b6b]/20 text-[#69a8a3]"><Navigation size={17} /></span>
            <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">Just Drive</span><span className="mt-0.5 block text-[10px] text-[#7f8c89]">Monitor ahead without a destination</span></span>
            <span className="text-[10px] uppercase tracking-[.12em] text-[#82908d]">Start</span>
          </button>
        </section>

        <section className="section-block">
          <div className="eyebrow mb-3">Useful out here</div>
          <div className="motion-stagger app-launcher-grid grid auto-rows-fr grid-cols-2 gap-2.5">
            <QuickLink icon={<Map size={20} />} label="Road map" note="Official conditions" href="/roads" />
            <QuickLink icon={<MountainSnow size={20} />} label="F-road assistant" note="Official section status" href={`/f-roads?vehicle=${encodeURIComponent(vehicle)}`} />
            <QuickLink icon={<Fuel size={20} />} label="Fuel / EV" note="Nearby and along route" href={`/fuel?vehicle=${encodeURIComponent(vehicle)}`} />
            <QuickLink icon={<ShieldAlert size={20} />} label="Emergency" note="112 Iceland" warning href="/emergency" />
          </div>
        </section>

        <div className="section-block"><VehicleSelector vehicle={vehicle} onChange={setVehicle} /></div>
      </main>
      <BottomNav hidden={destinationInteractionActive} />
    </>
  );
}

function RouteContextBanner({ destination, active, onClear }: { destination: string; active: boolean; onClear: () => void }) {
  return <section className="motion-state-enter mt-3 flex min-h-12 items-center gap-3 rounded-[18px] border border-[#69a8a3]/15 bg-[#2d6b6b]/[.08] px-3.5 py-2.5" aria-label={active ? `Active route to ${destination}` : `Showing checked route to ${destination}`}><Route size={16} className="shrink-0 text-[#69a8a3]" /><div className="min-w-0 flex-1"><div className="text-[9px] uppercase tracking-[.11em] text-[#718f8b]">{active ? "On your active route" : "Showing checked route"}</div><div className="mt-0.5 truncate text-[11px] font-semibold text-[#c4d0cd]">To {destination}</div></div>{active ? <Link href="/drive" className="motion-press min-h-10 shrink-0 rounded-[14px] px-3 py-3 text-[10px] font-semibold text-[#8fbab5]">Open</Link> : <button type="button" onClick={onClear} className="motion-press flex min-h-10 shrink-0 items-center gap-1.5 rounded-[14px] px-3 text-[10px] font-semibold text-[#9ca7a4]">Clear <X size={13} /></button>}</section>;
}

function HomeLocationPrompt({ status, accuracyMeters, onUseLocation, onDismiss, onRefresh }: {
  status: ReturnType<typeof useCurrentLocation>["status"];
  accuracyMeters?: number;
  onUseLocation: () => void;
  onDismiss: () => void;
  onRefresh: () => void;
}) {
  if (status === "prompt") return <section className="motion-state-enter surface-panel mt-3 flex items-start gap-3 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] bg-[#2d6b6b]/18 text-[#69a8a3]"><Crosshair size={19} /></span><div className="min-w-0 flex-1"><div className="text-[13px] font-semibold">Use your location</div><p className="mt-1 text-[10px] leading-5 text-[#8e9b98]">Get nearby wind, road conditions and advisories before choosing a destination.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={onUseLocation} className="motion-press min-h-11 rounded-[16px] bg-[#2d6b6b]/30 px-4 text-[11px] font-semibold text-[#a9d0cc]">Use my location</button><button type="button" onClick={onDismiss} className="motion-press min-h-11 rounded-[16px] px-3 text-[11px] text-[#8e9b98]">Not now</button></div></div></section>;
  if (["denied", "unavailable", "timeout", "error"].includes(status)) return <section className="motion-state-enter mt-3 flex items-center gap-3 rounded-[18px] border border-white/[.06] bg-white/[.025] px-3.5 py-3"><Crosshair size={16} className="shrink-0 text-[#82908d]" /><div className="min-w-0 flex-1"><div className="text-[11px] font-semibold text-[#aab3b0]">Location off</div><div className="mt-0.5 text-[9px] text-[#788582]">{status === "timeout" ? "Location request timed out. Try again when your signal improves." : "Allow location to see nearby conditions."}</div></div><button type="button" onClick={onUseLocation} className="motion-press min-h-10 shrink-0 rounded-[14px] px-3 text-[10px] font-semibold text-[#8fbab5]">Try again</button></section>;
  if (status === "available") return <section className="motion-state-enter mt-2 flex min-h-10 items-center justify-between gap-3 px-1 text-[9px] text-[#788582]"><span>Nearby location · approximately ±{Math.round(accuracyMeters ?? 0)} m</span><button type="button" onClick={onRefresh} className="motion-press min-h-10 rounded-[14px] px-3 font-semibold text-[#8fbab5]">Refresh</button></section>;
  return null;
}

function QuickLink({ icon, label, note, warning, href }: { icon: React.ReactNode; label: string; note: string; warning?: boolean; href: string }) {
  return (
    <Link href={href} className="motion-press glass card relative flex min-h-[104px] overflow-hidden p-4 text-left hover:-translate-y-0.5">
      <span className={`topo-lines ${warning ? "text-[#7a3b2e]" : "text-[#2d6b6b]"}`} />
      <span className="relative flex w-full flex-col justify-between"><span className={warning ? "text-[#d48c6b]" : "text-[#69a8a3]"}>{icon}</span><span><span className="block text-[13px] font-semibold">{label}</span><span className="mt-0.5 block text-[10px] text-[#7f8c89]">{note}</span></span></span>
    </Link>
  );
}

"use client";

import { Fuel, Map, MountainSnow, Navigation, ShieldAlert, Wind } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import BottomNav from "@/components/BottomNav";
import ConditionCard from "@/components/ConditionCard";
import DestinationAutocomplete from "@/components/DestinationAutocomplete";
import Logo from "@/components/Logo";
import VehicleSelector from "@/components/VehicleSelector";
import { clearDestinationSelection, storeDestinationSelection } from "@/lib/destination-selection-storage";
import type { GeocodedPlace, VehicleType } from "@/types/analysis";

export default function HomePage() {
  const router = useRouter();
  const [destination, setDestination] = useState("");
  const [selectedDestination, setSelectedDestination] = useState<GeocodedPlace>();
  const [vehicle, setVehicle] = useState<VehicleType>("Small car (2WD)");
  const [checking, setChecking] = useState(false);
  const [navigationError, setNavigationError] = useState<string>();
  const [destinationInteractionActive, setDestinationInteractionActive] = useState(false);
  const navigationPending = useRef(false);

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
            <span className="breathing h-1.5 w-1.5 rounded-full bg-[#34d399]" /> Live
          </div>
        </header>

        <section className="float-in section-block-lg">
          <div className="eyebrow">Official data · Route by route</div>
          <h1 className="mt-3 max-w-[360px] text-[34px] font-semibold leading-[1.06] tracking-[-0.052em]">Know the road.<br /><span className="text-[#9eaaa7]">Before it has opinions.</span></h1>
          <p className="mt-4 max-w-[340px] text-[13px] leading-6 text-[#95a19e]">Check a specific drive against current official road conditions, incidents and roadside measurements.</p>
        </section>

        <section className="float-in-delay section-block grid grid-cols-2 gap-2.5" aria-label="Current conditions">
          <ConditionCard icon={<Wind size={20} strokeWidth={1.6} />} label="Nearby wind" value="Not checked" note="Check a route for live data" tone="warning" featured />
          <div className="grid gap-2.5">
            <ConditionCard icon={<Navigation size={18} strokeWidth={1.6} />} label="Roads" value="Route only" tone="neutral" />
            <ConditionCard icon={<ShieldAlert size={18} strokeWidth={1.6} />} label="Advisories" value="Not checked" tone="neutral" />
          </div>
        </section>

        <section className="section-block-lg">
          <div className="mb-3 flex items-end justify-between"><div><div className="eyebrow">Plan ahead</div><h2 className="mt-1 text-lg font-semibold tracking-[-0.025em]">Where to?</h2></div><span className="text-[10px] text-[#7f8c89]">From Reykjavík</span></div>
          <DestinationAutocomplete value={destination} onValueChange={(value) => { setDestination(value); setSelectedDestination(undefined); setNavigationError(undefined); clearDestinationSelection(); }} onSelect={(place) => { setDestinationInteractionActive(false); setDestination(place.name); setSelectedDestination(place); storeDestinationSelection(place); navigateToCheck(place); }} onSubmit={checkDrive} disabled={checking} error={navigationError} onInteractionChange={setDestinationInteractionActive} />
          <button onClick={() => router.push(`/just-drive?vehicle=${encodeURIComponent(vehicle)}`)} className="glass mt-2 flex w-full items-center gap-3 rounded-[22px] px-4 py-3.5 text-left transition hover:bg-white/[.045]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-[#2d6b6b]/20 text-[#69a8a3]"><Navigation size={17} /></span>
            <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">Just Drive</span><span className="mt-0.5 block text-[10px] text-[#7f8c89]">Monitor ahead without a destination</span></span>
            <span className="text-[10px] uppercase tracking-[.12em] text-[#82908d]">Start</span>
          </button>
        </section>

        <section className="section-block">
          <div className="eyebrow mb-3">Useful out here</div>
          <div className="stagger-grid grid grid-cols-2 gap-2.5">
            <QuickButton icon={<Map size={20} />} label="Road map" note="Live conditions" onClick={() => router.push("/roads")} />
            <QuickButton icon={<MountainSnow size={20} />} label="F-road assistant" note="Official section status" onClick={() => router.push(`/f-roads?vehicle=${encodeURIComponent(vehicle)}`)} />
            <QuickButton icon={<Fuel size={20} />} label="Fuel / EV" note="Nearby and along route" onClick={() => router.push(`/fuel?vehicle=${encodeURIComponent(vehicle)}`)} />
            <QuickButton icon={<ShieldAlert size={20} />} label="Emergency" note="112 Iceland" warning onClick={() => router.push("/emergency")} />
          </div>
        </section>

        <div className="section-block"><VehicleSelector vehicle={vehicle} onChange={setVehicle} /></div>
      </main>
      <BottomNav hidden={destinationInteractionActive} />
    </>
  );
}

function QuickButton({ icon, label, note, warning, onClick }: { icon: React.ReactNode; label: string; note: string; warning?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="glass card relative flex min-h-[104px] overflow-hidden p-4 text-left transition hover:-translate-y-1">
      <span className={`topo-lines ${warning ? "text-[#7a3b2e]" : "text-[#2d6b6b]"}`} />
      <span className="relative flex w-full flex-col justify-between"><span className={warning ? "text-[#d48c6b]" : "text-[#69a8a3]"}>{icon}</span><span><span className="block text-[13px] font-semibold">{label}</span><span className="mt-0.5 block text-[10px] text-[#7f8c89]">{note}</span></span></span>
    </button>
  );
}

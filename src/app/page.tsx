"use client";

import { Fuel, Map, MountainSnow, Navigation, ShieldAlert, Wind } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

  function checkDrive() {
    const params = new URLSearchParams({ destination: destination || "Vík", vehicle });
    if (selectedDestination?.mapboxId) params.set("destinationId", selectedDestination.mapboxId);
    router.push(`/check?${params.toString()}`);
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
          <DestinationAutocomplete value={destination} onValueChange={(value) => { setDestination(value); setSelectedDestination(undefined); clearDestinationSelection(); }} onSelect={(place) => { setDestination(place.name); setSelectedDestination(place); storeDestinationSelection(place); }} onSubmit={checkDrive} />
        </section>

        <section className="section-block">
          <div className="eyebrow mb-3">Useful out here</div>
          <div className="stagger-grid grid grid-cols-2 gap-2.5">
            <QuickButton icon={<Map size={20} />} label="Road map" note="Live conditions" onClick={() => router.push("/roads")} />
            <QuickButton icon={<MountainSnow size={20} />} label="Highland roads" note="Seasonal access" />
            <QuickButton icon={<Fuel size={20} />} label="Fuel & charge" note="Stops ahead" />
            <QuickButton icon={<ShieldAlert size={20} />} label="Emergency" note="112 Iceland" warning />
          </div>
        </section>

        <div className="section-block"><VehicleSelector vehicle={vehicle} onChange={setVehicle} /></div>
      </main>
      <BottomNav />
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

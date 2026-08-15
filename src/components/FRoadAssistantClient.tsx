/* eslint-disable @next/next/no-img-element -- camera URLs are dynamic official IRCA records */
"use client";

import { AlertTriangle, Camera, CheckCircle2, ChevronRight, CloudOff, MountainSnow, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import BottomNav from "@/components/BottomNav";
import AppHeader from "@/components/AppHeader";
import DataAttribution from "@/components/DataAttribution";
import VehicleSelector from "@/components/VehicleSelector";
import { findFRoad, getVehicleSuitability, normalizeFRoadQuery } from "@/lib/f-road";
import type { VehicleType } from "@/types/analysis";
import type { FRoadEntry, FRoadSectionSummary, FRoadSourceStatus } from "@/types/f-road";

type Props = { catalog: FRoadEntry[]; initialVehicle: VehicleType; sourceStatus: FRoadSourceStatus };

export default function FRoadAssistantClient({ catalog, initialVehicle, sourceStatus }: Props) {
  const [query, setQuery] = useState("");
  const [selectedRoad, setSelectedRoad] = useState<FRoadEntry>();
  const [vehicle, setVehicle] = useState(initialVehicle);
  const [message, setMessage] = useState<string>();
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = useMemo(() => searchCatalog(catalog, query), [catalog, query]);
  const suitability = getVehicleSuitability(vehicle);

  function selectRoad(road: FRoadEntry) {
    setQuery(road.roadNumber);
    setSelectedRoad(road);
    setMessage(undefined);
    setFocused(false);
    setActiveIndex(-1);
  }

  function submit() {
    const match = findFRoad(catalog, query);
    if (match) selectRoad(match);
    else {
      setSelectedRoad(undefined);
      setMessage(normalizeFRoadQuery(query) ? "Road not found in the available official F-road sections." : "Enter an F-road number, for example F208.");
    }
  }

  return (
    <>
      <main className="page-shell">
        <AppHeader title="F-road Assistant" subtitle="Official highland-road status" />
        <p className="mt-4 max-w-[410px] text-[12px] leading-5 text-[#95a19e]">Check official sections, incidents and nearby cameras. Roadwise never guarantees that a road or river crossing is safe.</p>

        {!sourceStatus.sectionsAvailable ? <Unavailable text="Official F-road section data is unavailable. Road search cannot be completed right now." /> : null}

        <section className="section-block relative z-[60]">
          <div className="eyebrow section-label">Find an F-road</div>
          <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="roadwise-focus-shell glass card flex min-h-[64px] items-center gap-3 px-4 transition-[border-color,background-color,box-shadow]">
            <Search size={18} className="shrink-0 text-[#69a8a3]" />
            <input
              value={query}
              onChange={(event) => { setQuery(event.target.value); setMessage(undefined); setActiveIndex(-1); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && suggestions.length > 0) {
                  event.preventDefault();
                  setFocused(true);
                  setActiveIndex((index) => Math.min(suggestions.length - 1, index + 1));
                } else if (event.key === "ArrowUp" && suggestions.length > 0) {
                  event.preventDefault();
                  setFocused(true);
                  setActiveIndex((index) => Math.max(0, index - 1));
                } else if (event.key === "Enter" && activeIndex >= 0) {
                  event.preventDefault();
                  selectRoad(suggestions[activeIndex]);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setFocused(false);
                  setActiveIndex(-1);
                }
              }}
              role="combobox"
              aria-label="Search F-road"
              aria-autocomplete="list"
              aria-expanded={focused && suggestions.length > 0}
              aria-controls="f-road-results"
              aria-activedescendant={focused && activeIndex >= 0 ? `f-road-result-${activeIndex}` : undefined}
              autoComplete="off"
              inputMode="text"
              placeholder="F208 or 208"
              className="destination-input roadwise-focus-scroll min-w-0 flex-1 border-0 bg-transparent text-[15px] text-[#f5f1eb] outline-none ring-0 placeholder:text-[#64716e] focus:border-transparent focus:outline-none focus:ring-0"
            />
            <button type="submit" className="rounded-full bg-[#2d6b6b]/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.11em] text-[#a7cfca]">Check</button>
          </form>
          {focused && query.trim() && suggestions.length > 0 ? (
            <div id="f-road-results" role="listbox" className="destination-suggestions glass absolute left-0 right-0 top-full z-[70] mt-2 overflow-y-auto rounded-[22px] bg-[#111a1a]/95 p-2 shadow-[0_24px_65px_rgba(0,0,0,.5)]">
              {suggestions.map((road, index) => <button id={`f-road-result-${index}`} key={road.roadNumber} type="button" role="option" aria-selected={index === activeIndex} onMouseDown={(event) => event.preventDefault()} onPointerMove={() => setActiveIndex(index)} onClick={() => selectRoad(road)} className={`flex min-h-14 w-full items-center gap-3 rounded-[16px] px-3 py-2 text-left outline-none hover:bg-white/[.05] focus:bg-white/[.06] focus:outline-none ${index === activeIndex ? "bg-white/[.06]" : ""}`}><span className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-[#2d6b6b]/20 text-[#69a8a3]"><MountainSnow size={17} /></span><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{road.roadNumber}</span><span className="block truncate text-[10px] text-[#82908d]">{road.name ?? `${road.sections.length} official section${road.sections.length === 1 ? "" : "s"}`}</span></span><ChevronRight size={15} className="text-[#64716e]" /></button>)}
            </div>
          ) : null}
          {message ? <p className="mt-3 text-[11px] leading-5 text-[#d9a184]">{message}</p> : null}
        </section>

        {selectedRoad ? (
          <>
            <section className="glass card section-block relative overflow-hidden p-5"><span className="topo-lines text-[#2d6b6b]" /><div className="relative"><div className="eyebrow">Selected road</div><div className="mt-2 flex items-end justify-between gap-3"><div><h2 className="text-[29px] font-semibold tracking-[-.045em]">{selectedRoad.roadNumber}</h2><p className="mt-1 text-[11px] text-[#95a19e]">{selectedRoad.name ?? "Official road name unavailable"}</p></div><span className="rounded-full border border-white/[.08] bg-white/[.04] px-3 py-2 text-[9px] text-[#9ca7a4]">{selectedRoad.sections.length} section{selectedRoad.sections.length === 1 ? "" : "s"}</span></div><p className="mt-4 text-[10px] leading-5 text-[#82908d]">Each official section is shown independently. A closure on one section is not hidden by open conditions elsewhere.</p></div></section>

            <section className="section-block"><div className="eyebrow section-label">Official section status</div>{!sourceStatus.conditionsAvailable ? <Unavailable text="Official road conditions are unavailable. Section status is unknown." compact /> : null}<div className="surface-group">{selectedRoad.sections.map((section) => <SectionRow key={section.id} section={section} />)}</div></section>

            <section className="section-block"><div className="eyebrow section-label">Vehicle suitability</div><div className="surface-panel p-4"><div className="flex gap-3"><ShieldAlert size={20} className={suitability.level === "not-suitable" ? "shrink-0 text-[#d48c6b]" : "shrink-0 text-[#69a8a3]"} /><div><div className="text-[13px] font-semibold">{suitability.title}</div><p className="mt-1 text-[10px] leading-5 text-[#8e9b98]">{suitability.detail}</p></div></div></div><div className="mt-3"><VehicleSelector vehicle={vehicle} onChange={setVehicle} /></div></section>

            <section className="section-block"><div className="eyebrow section-label">Incidents & warnings</div>{!sourceStatus.incidentsAvailable ? <Unavailable text="Official incident data is unavailable." compact /> : selectedRoad.incidents.length ? <div className="surface-group">{selectedRoad.incidents.map((incident) => <div key={incident.id} className="surface-row flex gap-3 px-2 py-3.5"><AlertTriangle size={17} className="mt-0.5 shrink-0 text-[#d48c6b]" /><div><div className="text-[12px] font-semibold">{incident.title}</div><p className="mt-1 text-[10px] leading-4 text-[#82908d]">{incident.description ?? "Official IRCA incident report."}</p></div></div>)}</div> : <Empty text="No relevant official incidents are currently matched to this road." />}</section>

            <section className="section-block"><div className="eyebrow section-label">Nearby cameras</div>{!sourceStatus.camerasAvailable ? <Unavailable text="Official road camera data is unavailable." compact /> : selectedRoad.cameras.length ? <div className="grid gap-3">{selectedRoad.cameras.map((camera) => <article key={camera.id} className="glass card overflow-hidden"><div className="relative aspect-[16/9] bg-[#0d1414]"><img src={camera.imageUrl} alt={`Road camera at ${camera.name}`} className="h-full w-full object-cover" loading="lazy" /><span className="absolute bottom-3 left-3 rounded-full bg-[#0a0f0f]/80 px-3 py-1.5 text-[9px] uppercase tracking-[.1em] text-[#d9dedc]">Latest road camera image</span></div><div className="flex gap-3 p-4"><Camera size={18} className="shrink-0 text-[#69a8a3]" /><div><div className="text-[12px] font-semibold">{camera.name}</div><p className="mt-1 text-[10px] text-[#82908d]">{camera.roadName ?? camera.description ?? "Official location name unavailable"}</p></div></div></article>)}</div> : <Empty text="No nearby relevant official road cameras were matched." />}</section>

            <section className="surface-panel section-block p-4"><div className="text-[11px] font-semibold">River crossings</div><p className="mt-1 text-[10px] leading-5 text-[#8e9b98]">River crossing information is not yet available in Roadwise.</p></section>
          </>
        ) : null}

        <section className="surface-panel section-block flex gap-3 p-4"><CheckCircle2 size={18} className="shrink-0 text-[#69a8a3]" /><div><div className="text-[10px] uppercase tracking-[.13em] text-[#8fbab5]">Source freshness</div><p className="mt-1 text-[11px] text-[#aab3b0]">{sourceStatus.updatedAt ? `Official road-condition feed response ${formatTime(sourceStatus.updatedAt)}.` : "Official road-condition update time unavailable."}</p>{sourceStatus.stale ? <p className="mt-1 text-[10px] text-[#d48c6b]">Road-condition response may be stale. Confirm with Umferðin before driving.</p> : null}</div></section>
        <DataAttribution />
      </main>
      <BottomNav hidden={focused} />
    </>
  );
}

function SectionRow({ section }: { section: FRoadSectionSummary }) {
  const color = { open: "text-[#34d399]", caution: "text-[#e8c4b0]", difficult: "text-[#d48c6b]", closed: "text-[#ef8e76]", unknown: "text-[#82908d]" }[section.status];
  return <div className="surface-row px-2 py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[12px] font-semibold">{section.name}</div>{section.description ? <p className="mt-1 text-[10px] leading-4 text-[#82908d]">{section.description}</p> : section.status === "unknown" ? <p className="mt-1 text-[10px] text-[#82908d]">Official condition unavailable for this section.</p> : null}</div><span className={`shrink-0 rounded-full bg-white/[.04] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[.08em] ${color}`}>{section.statusLabel}</span></div>{section.stale ? <p className="mt-2 text-[9px] uppercase tracking-[.1em] text-[#d48c6b]">Stale condition record</p> : null}</div>;
}

function Unavailable({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={`surface-panel flex gap-3 ${compact ? "mb-3 p-3" : "section-block p-4"}`}><CloudOff size={18} className="shrink-0 text-[#d48c6b]" /><p className="text-[10px] leading-5 text-[#a3adaa]">{text}</p></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="surface-panel p-4 text-[10px] leading-5 text-[#82908d]">{text}</div>;
}

function searchCatalog(catalog: FRoadEntry[], query: string): FRoadEntry[] {
  const compact = query.trim().toUpperCase().replace(/\s+/g, "");
  if (!compact) return [];
  const reference = compact.startsWith("F") ? compact : `F${compact}`;
  return catalog.filter((road) => road.roadNumber.startsWith(reference) || road.name?.toUpperCase().includes(compact)).slice(0, 6);
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Atlantic/Reykjavik" }).format(new Date(value));
}

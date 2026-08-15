/* eslint-disable @next/next/no-img-element -- official camera image URLs are dynamic */
"use client";

import {
  AlertTriangle,
  Camera,
  CloudOff,
  Crosshair,
  Gauge,
  Navigation,
  Snowflake,
  Thermometer,
  TriangleAlert,
  Wind,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FilterSpecification, GeoJSONSource, Map as MapboxMap, MapLayerMouseEvent, Marker } from "mapbox-gl";

import BottomNav from "@/components/BottomNav";
import DataAttribution from "@/components/DataAttribution";
import Logo from "@/components/Logo";
import { matchRoadSectionDetails } from "@/lib/road-map";
import type { RoadMapCamera, RoadMapFilter, RoadMapIncident, RoadMapObservation, RoadMapPayload, RoadMapSection } from "@/types/road-map";

type Selection =
  | { kind: "section"; item: RoadMapSection }
  | { kind: "incident"; item: RoadMapIncident }
  | { kind: "observation"; item: RoadMapObservation }
  | { kind: "camera"; item: RoadMapCamera };

const FILTERS: Array<{ id: RoadMapFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "closures", label: "Closures" },
  { id: "difficult", label: "Difficult" },
  { id: "incidents", label: "Incidents" },
  { id: "weather", label: "Weather" },
  { id: "cameras", label: "Cameras" },
];

const SECTION_LAYER = "roadwise-road-sections";
const POINT_LAYER_GROUPS = {
  incidents: ["incidents-clusters", "incidents-count", "incidents-points"],
  weather: ["weather-clusters", "weather-count", "weather-points"],
  cameras: ["cameras-clusters", "cameras-count", "cameras-points"],
} as const;

export default function RoadsClient({ initialData, mapConfigured }: { initialData: RoadMapPayload; mapConfigured: boolean }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | undefined>(undefined);
  const userMarkerRef = useRef<Marker | undefined>(undefined);
  const [filter, setFilter] = useState<RoadMapFilter>("all");
  const [selection, setSelection] = useState<Selection>();
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string>();
  const [locationStatus, setLocationStatus] = useState<string>();

  useEffect(() => {
    if (!mapConfigured || !mapContainer.current || mapRef.current) return;
    let disposed = false;
    let map: MapboxMap | undefined;
    void import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (disposed || !mapContainer.current) return;
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
      if (!token) return;
      map = new mapboxgl.Map({
        container: mapContainer.current,
        accessToken: token,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [-18.8, 64.85],
        zoom: 4.65,
        minZoom: 4,
        maxZoom: 15,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
      map.on("error", () => {
        if (map && !map.isStyleLoaded()) setMapError("The interactive map could not be loaded. Official conditions remain available below.");
      });
      map.on("load", () => {
        if (!map) return;
        reduceBaseMapClutter(map);
        addRoadLayers(map, initialData);
        addPointLayers(map, initialData);
        bindMapInteractions(map, initialData, setSelection);
        setMapReady(true);
      });
    }).catch(() => setMapError("The interactive map could not be loaded. Official conditions remain available below."));
    return () => {
      disposed = true;
      userMarkerRef.current?.remove();
      map?.remove();
      mapRef.current = undefined;
    };
  }, [initialData, mapConfigured]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const sectionFilter = filter === "closures"
      ? ["==", ["get", "status"], "closed"] as FilterSpecification
      : filter === "difficult"
        ? ["in", ["get", "status"], ["literal", ["caution", "difficult"]]] as FilterSpecification
        : null;
    map.setFilter(SECTION_LAYER, sectionFilter);
    map.setLayoutProperty(SECTION_LAYER, "visibility", ["all", "closures", "difficult"].includes(filter) ? "visible" : "none");
    setLayerGroupVisibility(map, POINT_LAYER_GROUPS.incidents, filter === "all" || filter === "incidents");
    setLayerGroupVisibility(map, POINT_LAYER_GROUPS.weather, filter === "weather");
    setLayerGroupVisibility(map, POINT_LAYER_GROUPS.cameras, filter === "all" || filter === "cameras");
  }, [filter, mapReady]);

  async function locateMe() {
    const map = mapRef.current;
    if (!navigator.geolocation || !map) {
      setLocationStatus("Location is unavailable in this browser.");
      return;
    }
    setLocationStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(async (position) => {
      const coordinates: [number, number] = [position.coords.longitude, position.coords.latitude];
      const { default: mapboxgl } = await import("mapbox-gl");
      userMarkerRef.current?.remove();
      userMarkerRef.current = new mapboxgl.Marker({ color: "#e8c4b0" }).setLngLat(coordinates).addTo(map);
      map.easeTo({ center: coordinates, zoom: Math.max(map.getZoom(), 10), duration: 900 });
      setLocationStatus(`Your location · approximately ±${Math.round(position.coords.accuracy)} m`);
    }, (error) => setLocationStatus(error.code === error.PERMISSION_DENIED ? "Location permission was denied." : "Your location could not be found."), {
      enableHighAccuracy: true,
      maximumAge: 10_000,
      timeout: 15_000,
    });
  }

  const counts = useMemo(() => ({
    closures: initialData.sections.filter((section) => section.status === "closed").length,
    difficult: initialData.sections.filter((section) => section.status === "difficult" || section.status === "caution").length,
  }), [initialData.sections]);

  return (
    <>
      <main className="page-shell">
        <Logo />
        <header className="section-block-lg"><div className="eyebrow">Official road map</div><h1 className="mt-2 text-[32px] font-semibold tracking-[-0.05em]">Iceland, right now</h1><p className="mt-3 max-w-[390px] text-[13px] leading-6 text-[#95a19e]">Current official road sections, incidents, roadside observations and camera locations. Conditions can change quickly.</p></header>

        <section className="section-block">
          <div className="-mx-[var(--app-gutter)] overflow-x-auto px-[var(--app-gutter)] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Map filters"><div className="flex w-max gap-2">{FILTERS.map(({ id, label }) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`min-h-11 rounded-full border px-4 text-[11px] font-semibold transition ${filter === id ? "border-[#69a8a3]/45 bg-[#2d6b6b]/35 text-[#d7e5e2]" : "border-white/[.08] bg-white/[.035] text-[#8f9c99]"}`}>{label}</button>)}</div></div>

          <div className="glass relative mt-2 h-[min(64dvh,570px)] min-h-[420px] overflow-hidden rounded-[28px] border-white/[.1]" aria-label="Interactive Iceland road-condition map">
            <div ref={mapContainer} className="absolute inset-0" />
            {!mapConfigured || mapError ? <MapFallback message={mapError ?? "Add a restricted NEXT_PUBLIC_MAPBOX_TOKEN to enable the interactive map."} /> : null}
            {mapConfigured && !mapReady && !mapError ? <div className="absolute inset-0 flex items-center justify-center bg-[#0d1515]"><div className="text-center"><Navigation size={25} className="mx-auto animate-pulse text-[#69a8a3]" /><p className="mt-3 text-[12px] text-[#8e9b98]">Loading official road map…</p></div></div> : null}
            {mapReady ? <button type="button" onClick={locateMe} aria-label="Locate me" className="glass absolute right-3 top-3 z-10 flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#111a1a]/90 text-[#e8c4b0]"><Crosshair size={20} /></button> : null}
            {locationStatus ? <div className="glass absolute left-3 top-3 z-10 max-w-[calc(100%-5rem)] rounded-full bg-[#111a1a]/90 px-3 py-2 text-[10px] text-[#c0c9c6]">{locationStatus}</div> : null}
            <div className="pointer-events-none absolute bottom-7 left-3 z-10 grid gap-1.5"><Legend color="#ef8e76" label="Closed" /><Legend color="#d48c6b" label="Difficult" /><Legend color="#e8c4b0" label="Caution" /><Legend color="#4d8f8a" label="Normal" /></div>
          </div>
        </section>

        {(!initialData.sources.sections || !initialData.sources.conditions) ? <section className="surface-panel section-block flex gap-3 p-4"><CloudOff size={19} className="shrink-0 text-[#d48c6b]" /><p className="text-[11px] leading-5 text-[#9ca7a4]">Some official road-section data is unavailable. Unknown data is not shown as normal.</p></section> : null}

        <section className="section-block"><div className="mb-3 flex items-end justify-between"><div><div className="eyebrow">Official fallback list</div><h2 className="mt-1 text-[19px] font-semibold">Conditions needing attention</h2></div><span className="text-right text-[10px] leading-4 text-[#82908d]">{counts.closures} closed<br />{counts.difficult} care / difficult</span></div><FallbackList data={initialData} onSelect={setSelection} /></section>

        <section className="surface-panel section-block p-4 text-[10px] leading-5 text-[#82908d]"><div>{initialData.updatedAt ? `Official feeds updated ${formatTimestamp(initialData.updatedAt)}.` : "Official update time unavailable."}</div>{initialData.sourceStale ? <div className="mt-1 text-[#d48c6b]">The latest source response may be stale. Confirm with Umferðin.</div> : null}</section>
        <DataAttribution />
      </main>
      {selection ? <DetailSheet selection={selection} data={initialData} onClose={() => setSelection(undefined)} /> : null}
      <BottomNav />
    </>
  );
}

function addRoadLayers(map: MapboxMap, data: RoadMapPayload) {
  map.addSource("roadwise-sections", { type: "geojson", data: { type: "FeatureCollection", features: data.sections.map((section) => ({ type: "Feature", id: section.id, properties: { id: section.id, status: section.status }, geometry: section.geometry })) } });
  map.addLayer({ id: SECTION_LAYER, type: "line", source: "roadwise-sections", paint: { "line-color": ["match", ["get", "status"], "closed", "#ef8e76", "difficult", "#d48c6b", "caution", "#e8c4b0", "normal", "#4d8f8a", "#74817e"], "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2, 8, 4, 12, 7], "line-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.82, 9, 1] } });
}

function addPointLayers(map: MapboxMap, data: RoadMapPayload) {
  addClusteredPoints(map, "incidents", data.incidents.map((incident) => ({ id: incident.id, coordinates: incident.coordinates, icon: incidentIcon(incident.type) })), "#d48c6b", true);
  addClusteredPoints(map, "weather", data.observations.map((observation) => ({ id: observation.id, coordinates: observation.coordinates, icon: "↗" })), "#69a8a3", false);
  addClusteredPoints(map, "cameras", data.cameras.map((camera) => ({ id: camera.id, coordinates: camera.coordinates, icon: "▣" })), "#e8c4b0", true);
}

function addClusteredPoints(map: MapboxMap, name: "incidents" | "weather" | "cameras", items: Array<{ id: string; coordinates: [number, number]; icon: string }>, color: string, visible: boolean) {
  map.addSource(name, { type: "geojson", cluster: true, clusterMaxZoom: 8, clusterRadius: 44, data: { type: "FeatureCollection", features: items.map((item) => ({ type: "Feature", id: item.id, properties: { id: item.id, icon: item.icon }, geometry: { type: "Point", coordinates: item.coordinates } })) } });
  const visibility = visible ? "visible" : "none";
  map.addLayer({ id: `${name}-clusters`, type: "circle", source: name, filter: ["has", "point_count"], layout: { visibility }, paint: { "circle-color": "#182525", "circle-stroke-color": color, "circle-stroke-width": 1.5, "circle-radius": ["step", ["get", "point_count"], 14, 12, 17, 40, 21] } });
  map.addLayer({ id: `${name}-count`, type: "symbol", source: name, filter: ["has", "point_count"], layout: { visibility, "text-field": ["get", "point_count_abbreviated"], "text-size": 10 }, paint: { "text-color": "#f5f1eb" } });
  map.addLayer({ id: `${name}-points`, type: "symbol", source: name, filter: ["!", ["has", "point_count"]], layout: { visibility, "text-field": ["get", "icon"], "text-size": name === "incidents" ? 15 : 17, "text-allow-overlap": false }, paint: { "text-color": color, "text-halo-color": "#101818", "text-halo-width": 2 } });
}

function bindMapInteractions(map: MapboxMap, data: RoadMapPayload, select: (selection: Selection) => void) {
  const bindings: Array<[string, Selection["kind"], Array<RoadMapSection | RoadMapIncident | RoadMapObservation | RoadMapCamera>]> = [
    [SECTION_LAYER, "section", data.sections],
    ["incidents-points", "incident", data.incidents],
    ["weather-points", "observation", data.observations],
    ["cameras-points", "camera", data.cameras],
  ];
  for (const [layer, kind, items] of bindings) {
    map.on("click", layer, (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      const item = items.find((candidate) => candidate.id === id);
      if (item) select({ kind, item } as Selection);
    });
    map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
  }
  for (const sourceName of ["incidents", "weather", "cameras"] as const) {
    const layer = `${sourceName}-clusters`;
    map.on("click", layer, (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const clusterId = Number(feature?.properties?.cluster_id);
      const coordinates = feature?.geometry.type === "Point" ? feature.geometry.coordinates : undefined;
      if (!Number.isFinite(clusterId) || !coordinates) return;
      (map.getSource(sourceName) as GeoJSONSource).getClusterExpansionZoom(clusterId, (error, zoom) => {
        if (!error && zoom !== null && zoom !== undefined) map.easeTo({ center: coordinates as [number, number], zoom, duration: 500 });
      });
    });
    map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
  }
}

function reduceBaseMapClutter(map: MapboxMap) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type === "symbol" && /(poi|transit|airport)/i.test(layer.id)) map.setLayoutProperty(layer.id, "visibility", "none");
  }
}

function setLayerGroupVisibility(map: MapboxMap, layers: readonly string[], visible: boolean) {
  for (const layer of layers) if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", visible ? "visible" : "none");
}

function FallbackList({ data, onSelect }: { data: RoadMapPayload; onSelect: (selection: Selection) => void }) {
  const sections = data.sections.filter((section) => section.status === "closed" || section.status === "difficult" || section.status === "caution").sort((a, b) => statusRank(b.status) - statusRank(a.status)).slice(0, 12);
  const incidents = data.incidents.slice(0, 6);
  if (!sections.length && !incidents.length) return <div className="surface-panel p-4 text-[11px] leading-5 text-[#8e9b98]">No closures, difficult/caution sections or notable incidents are present in the available official data.</div>;
  return <div className="surface-group">{sections.map((section) => <button type="button" key={section.id} onClick={() => onSelect({ kind: "section", item: section })} className="surface-row flex min-h-16 w-full items-center gap-3 px-2 py-3 text-left"><StatusDot status={section.status} /><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold">{roadLabel(section)}</span><span className="mt-1 block truncate text-[10px] text-[#82908d]">{section.name ?? section.comment ?? "Official section"}</span></span><span className="text-[9px] uppercase tracking-[.08em] text-[#9da8a5]">{section.status}</span></button>)}{incidents.map((incident) => <button type="button" key={incident.id} onClick={() => onSelect({ kind: "incident", item: incident })} className="surface-row flex min-h-16 w-full items-center gap-3 px-2 py-3 text-left"><AlertTriangle size={17} className="shrink-0 text-[#d48c6b]" /><span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold">{incident.title}</span><span className="mt-1 block truncate text-[10px] text-[#82908d]">{incident.roadName ?? incident.roadNumber ?? "Official incident"}</span></span></button>)}</div>;
}

function DetailSheet({ selection, data, onClose }: { selection: Selection; data: RoadMapPayload; onClose: () => void }) {
  return <aside role="dialog" aria-modal="false" aria-label="Road map details" className="fixed bottom-[calc(94px+env(safe-area-inset-bottom))] left-1/2 z-[80] max-h-[min(66dvh,560px)] w-[min(calc(100%-24px),456px)] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-[28px] border border-white/[.11] bg-[#101919]/[.97] shadow-[0_28px_80px_rgba(0,0,0,.58)] backdrop-blur-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[.07] bg-[#101919]/95 px-5 py-4 backdrop-blur-xl"><div className="eyebrow">Official detail</div><button type="button" onClick={onClose} aria-label="Close details" className="flex h-10 w-10 items-center justify-center rounded-[15px] bg-white/[.05] text-[#a4aeab]"><X size={18} /></button></div><div className="p-5">{selection.kind === "section" ? <SectionDetail section={selection.item} data={data} /> : selection.kind === "incident" ? <IncidentDetail incident={selection.item} /> : selection.kind === "observation" ? <ObservationDetail observation={selection.item} referenceTime={data.generatedAt} /> : <CameraDetail camera={selection.item} />}</div></aside>;
}

function SectionDetail({ section, data }: { section: RoadMapSection; data: RoadMapPayload }) {
  const nearby = matchRoadSectionDetails(section, data);
  return <><div className="flex items-start gap-3"><StatusDot status={section.status} /><div><h2 className="text-[20px] font-semibold tracking-[-.03em]">{roadLabel(section)}</h2><p className="mt-1 text-[12px] text-[#9ba6a3]">{section.name ?? "Official section name unavailable"}</p></div></div><DetailGrid items={[["Status", section.status], ["Official condition", humanState(section.officialState)], ["Updated", section.updatedAt ? formatTimestamp(section.updatedAt) : "Unavailable"], ["Freshness", section.stale ? "Stale record" : "Current feed record"]]} />{section.comment ? <DetailBlock title="Official comment">{section.comment}</DetailBlock> : null}{nearby.incidents.length ? <DetailBlock title="Relevant incidents">{nearby.incidents.map((incident) => <div key={incident.id} className="border-b border-white/[.06] py-2 last:border-0"><div className="font-semibold">{incident.title}</div><div className="mt-1 text-[#8e9b98]">{incident.description ?? "Official incident report."}</div></div>)}</DetailBlock> : null}{nearby.observation ? <DetailBlock title="Nearest roadside observation"><div className="font-semibold">{nearby.observation.name} · {nearby.observation.distanceKm.toFixed(1)} km</div><div className="mt-1 text-[#82908d]">{nearby.observation.observedAt ? observationAge(nearby.observation.observedAt, data.generatedAt) : "Observation time unavailable"}</div><ObservationValues observation={nearby.observation} /></DetailBlock> : null}{nearby.cameras.length ? <DetailBlock title="Nearby official cameras"><div className="grid gap-3">{nearby.cameras.map((camera) => <CameraCard key={camera.id} camera={camera} />)}</div></DetailBlock> : null}<SafetyCopy /></>;
}

function IncidentDetail({ incident }: { incident: RoadMapIncident }) { return <><div className="flex gap-3"><TriangleAlert size={24} className="shrink-0 text-[#d48c6b]" /><div><h2 className="text-[20px] font-semibold">{incident.title}</h2><p className="mt-1 text-[12px] text-[#8e9b98]">{incident.roadName ?? incident.roadNumber ?? "Official IRCA incident"}</p></div></div>{incident.description ? <DetailBlock title="Official comment">{incident.description}</DetailBlock> : null}<DetailGrid items={[["Type", humanState(incident.type)], ["Updated", incident.updatedAt ? formatTimestamp(incident.updatedAt) : "Unavailable"], ["Freshness", incident.stale ? "Stale record" : "Current feed record"]]} /><SafetyCopy /></>; }
function ObservationDetail({ observation, referenceTime }: { observation: RoadMapObservation; referenceTime: string }) { return <><div className="flex gap-3"><Wind size={24} className="shrink-0 text-[#69a8a3]" /><div><h2 className="text-[20px] font-semibold">{observation.name}</h2><p className="mt-1 text-[12px] text-[#8e9b98]">Roadside observation · {observation.observedAt ? observationAge(observation.observedAt, referenceTime) : "time unavailable"}</p></div></div><ObservationValues observation={observation} /><p className="mt-4 text-[11px] leading-5 text-[#82908d]">A station observation is not, by itself, a Roadwise weather warning.</p></>; }
function CameraDetail({ camera }: { camera: RoadMapCamera }) { return <><div className="flex gap-3"><Camera size={24} className="shrink-0 text-[#e8c4b0]" /><div><h2 className="text-[20px] font-semibold">{camera.name}</h2><p className="mt-1 text-[12px] text-[#8e9b98]">{camera.roadName ?? camera.roadNumber ?? camera.description ?? "Official camera location"}</p></div></div><div className="mt-4"><CameraCard camera={camera} /></div></>; }

function CameraCard({ camera }: { camera: RoadMapCamera }) { return <div className="overflow-hidden rounded-[20px] border border-white/[.08] bg-white/[.03]"><div className="relative aspect-[16/9] bg-[#080d0d]"><img src={camera.imageUrl} alt={`Road camera at ${camera.name}`} className="h-full w-full object-cover" loading="lazy" /><span className="absolute bottom-2 left-2 rounded-full bg-[#0a0f0f]/85 px-2.5 py-1.5 text-[8px] uppercase tracking-[.1em]">Latest road camera image</span></div><div className="p-3 text-[11px]"><div className="font-semibold">{camera.name}</div><div className="mt-1 text-[#82908d]">{camera.roadName ?? camera.roadNumber ?? "IRCA camera"}</div></div></div>; }
function ObservationValues({ observation }: { observation: RoadMapObservation }) { const values = observation.values; const rows = [["Wind", values.windSpeedMps, "m/s", Wind], ["Gust", values.maximumWindSpeedMps, "m/s", Gauge], ["Air", values.airTemperatureC, "°C", Thermometer], ["Road surface", values.roadSurfaceTemperatureC, "°C", Snowflake]] as const; const available = rows.filter(([, value]) => value !== undefined); return available.length ? <div className="mt-4 grid grid-cols-2 gap-2">{available.map(([label, value, unit, Icon]) => <div key={label} className="rounded-[16px] bg-white/[.04] p-3"><Icon size={15} className="text-[#69a8a3]" /><div className="mt-2 text-[10px] text-[#82908d]">{label}</div><div className="mt-0.5 text-[14px] font-semibold">{value?.toFixed(1)} {unit}</div></div>)}</div> : <p className="mt-4 text-[11px] text-[#82908d]">No supported measurement values are available.</p>; }
function DetailGrid({ items }: { items: string[][] }) { return <div className="mt-5 grid grid-cols-2 gap-2">{items.map(([label, value]) => <div key={label} className="rounded-[16px] bg-white/[.035] p-3"><div className="text-[9px] uppercase tracking-[.1em] text-[#82908d]">{label}</div><div className="mt-1 text-[11px] font-semibold capitalize">{value}</div></div>)}</div>; }
function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mt-5 border-t border-white/[.07] pt-4"><div className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#e8c4b0]">{title}</div><div className="mt-2 text-[11px] leading-5 text-[#aab3b0]">{children}</div></section>; }
function SafetyCopy() { return <p className="mt-5 text-[10px] leading-5 text-[#82908d]">Roadwise reports available official information and never determines that a road is safe.</p>; }
function MapFallback({ message }: { message: string }) { return <div className="absolute inset-0 z-20 flex items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgba(45,107,107,.25),#0d1515_66%)] p-8 text-center"><div><CloudOff size={27} className="mx-auto text-[#d48c6b]" /><div className="mt-3 text-[14px] font-semibold">Map unavailable</div><p className="mx-auto mt-2 max-w-[280px] text-[11px] leading-5 text-[#8e9b98]">{message}</p></div></div>; }
function Legend({ color, label }: { color: string; label: string }) { return <div className="glass flex w-fit items-center gap-2 rounded-full bg-[#101818]/85 px-2.5 py-1.5 text-[8px] text-[#b4bdb9]"><span className="h-1.5 w-4 rounded-full" style={{ backgroundColor: color }} />{label}</div>; }
function StatusDot({ status }: { status: RoadMapSection["status"] }) { const colors = { closed: "bg-[#ef8e76]", difficult: "bg-[#d48c6b]", caution: "bg-[#e8c4b0]", normal: "bg-[#4d8f8a]", unknown: "bg-[#74817e]" }; return <span className={`h-3 w-3 shrink-0 rounded-full ${colors[status]}`} />; }
function roadLabel(section: RoadMapSection) { return section.roadNumbers.length ? section.roadNumbers.join(" · ") : section.name ?? "Official road section"; }
function statusRank(status: RoadMapSection["status"]) { return { unknown: 0, normal: 1, caution: 2, difficult: 3, closed: 4 }[status]; }
function humanState(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase()); }
function incidentIcon(type: RoadMapIncident["type"]) { if (type === "roadworks") return "◆"; if (type === "obstructionOnTheRoad") return "!"; if (type === "flooding") return "≈"; if (type === "looseChippings") return "∴"; if (type === "accident") return "+"; if (type === "strongWinds") return "↝"; return "●"; }
function formatTimestamp(value: string) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Atlantic/Reykjavik" }).format(new Date(value)); }
function observationAge(value: string, referenceTime: string) { const minutes = Math.max(0, Math.round((Date.parse(referenceTime) - Date.parse(value)) / 60_000)); return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} hr ago`; }

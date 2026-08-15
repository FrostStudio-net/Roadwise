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
import AppHeader from "@/components/AppHeader";
import DataAttribution from "@/components/DataAttribution";
import MapDiagnosticStatus from "@/components/MapDiagnosticStatus";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { developmentMapError, initialMapDiagnostics, mapCanvasSize, mapContainerHasSize, observeMapSize, publicMapboxToken, ROADWISE_MAP_STYLE, sanitizeMapError } from "@/lib/client-map";
import { matchRoadSectionDetails, ROAD_MAP_DEFAULT_VIEW, roadMapStatusLabel } from "@/lib/road-map";
import type { RoadMapCamera, RoadMapFilter, RoadMapIncident, RoadMapObservation, RoadMapPayload, RoadMapSection } from "@/types/road-map";

type Selection =
  | { kind: "section"; item: RoadMapSection }
  | { kind: "incident"; item: RoadMapIncident }
  | { kind: "observation"; item: RoadMapObservation }
  | { kind: "camera"; item: RoadMapCamera };
type AttentionFilter = "closed" | "difficult" | "incidents";

const FILTERS: Array<{ id: RoadMapFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "closures", label: "Closures" },
  { id: "difficult", label: "Difficult" },
  { id: "incidents", label: "Incidents" },
  { id: "weather", label: "Weather" },
  { id: "cameras", label: "Cameras" },
];

const SECTION_LAYER = "roadwise-road-sections";
const ATTENTION_SECTION_FILTER = ["in", ["get", "status"], ["literal", ["closed", "difficult", "caution"]]] as FilterSpecification;
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
  const [mapLayersReady, setMapLayersReady] = useState(false);
  const [mapError, setMapError] = useState<string>();
  const [mapDiagnostics, setMapDiagnostics] = useState(() => initialMapDiagnostics(mapConfigured));
  const [locationStatus, setLocationStatus] = useState<string>();
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>("closed");
  useBodyScrollLock(Boolean(selection) || attentionOpen);

  useEffect(() => {
    if (!mapConfigured || !mapContainer.current || mapRef.current) return;
    let disposed = false;
    let map: MapboxMap | undefined;
    let stopObservingSize: (() => void) | undefined;
    let styleReady = false;
    let layersInstalled = false;
    const timeout = window.setTimeout(() => {
      if (!styleReady) {
        developmentMapError("roads", "initialization timed out");
        setMapDiagnostics((current) => ({ ...current, mapErrorCode: "timeout", mapErrorMessage: "Map style did not load within 12 seconds." }));
        setMapError("The interactive map took too long to load. Official conditions remain available below.");
      }
    }, 12_000);
    void import("mapbox-gl").then(({ default: mapboxgl }) => {
      const container = mapContainer.current;
      if (disposed || !container) return;
      const token = publicMapboxToken();
      if (!token) { window.clearTimeout(timeout); setMapDiagnostics((current) => ({ ...current, mapErrorCode: "token-missing", mapErrorMessage: "NEXT_PUBLIC_MAPBOX_TOKEN was not configured at build time." })); setMapError("A restricted public Mapbox token is required. Official conditions remain available below."); return; }
      const webglSupported = mapboxgl.supported();
      setMapDiagnostics((current) => ({ ...current, webglSupported }));
      if (!webglSupported) { window.clearTimeout(timeout); setMapDiagnostics((current) => ({ ...current, mapErrorCode: "webgl-unsupported", mapErrorMessage: "Mapbox GL reported that WebGL is unavailable." })); setMapError("This browser does not support the WebGL map. Official conditions remain available below."); return; }
      const bounds = container.getBoundingClientRect();
      setMapDiagnostics((current) => ({ ...current, tokenConfigured: true, containerWidth: Math.round(bounds.width), containerHeight: Math.round(bounds.height) }));
      if (!mapContainerHasSize(container)) { window.clearTimeout(timeout); developmentMapError("roads", "container has no size"); setMapDiagnostics((current) => ({ ...current, mapErrorCode: "container-size", mapErrorMessage: `Map container measured ${Math.round(bounds.width)}×${Math.round(bounds.height)}.` })); setMapError("The interactive map could not be sized. Official conditions remain available below."); return; }
      try {
        map = new mapboxgl.Map({
          container,
          accessToken: token,
          style: ROADWISE_MAP_STYLE,
          center: ROAD_MAP_DEFAULT_VIEW.center,
          zoom: ROAD_MAP_DEFAULT_VIEW.zoom,
          minZoom: 4,
          maxZoom: 15,
          attributionControl: false,
        });
      } catch (error) {
        window.clearTimeout(timeout);
        developmentMapError("roads", "constructor failed", error);
        const sanitized = sanitizeMapError(error);
        setMapDiagnostics((current) => ({ ...current, mapErrorCode: sanitized.code ?? "constructor", mapErrorMessage: sanitized.message }));
        setMapError("The interactive map could not be initialized. Official conditions remain available below.");
        return;
      }
      if (!map) return;
      mapRef.current = map;
      const initialCanvasSize = mapCanvasSize(map);
      setMapDiagnostics((current) => ({ ...current, mapCreated: true, ...initialCanvasSize }));
      stopObservingSize = observeMapSize(map, container, (size) => setMapDiagnostics((current) => ({ ...current, ...size })));
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
      map.on("style.load", () => {
        if (!map || layersInstalled) return;
        styleReady = true;
        window.clearTimeout(timeout);
        setMapError(undefined);
        setMapReady(true);
        setMapDiagnostics((current) => ({ ...current, styleLoaded: true, ...mapCanvasSize(map!) }));
        map.resize();
        try {
          reduceBaseMapClutter(map);
          addRoadLayers(map, initialData);
          addPointLayers(map, initialData);
          bindMapInteractions(map, initialData, setSelection);
          layersInstalled = true;
          setMapLayersReady(true);
        } catch (error) {
          const sanitized = sanitizeMapError(error);
          developmentMapError("roads", "Roadwise layer setup failed", error);
          setMapDiagnostics((current) => ({ ...current, mapErrorCode: sanitized.code ?? "layer-setup", mapErrorMessage: sanitized.message }));
        }
      });
      map.on("error", (event) => {
        const sanitized = sanitizeMapError(event.error);
        developmentMapError("roads", "Mapbox GL error", event.error);
        setMapDiagnostics((current) => ({ ...current, mapErrorCode: sanitized.code, mapErrorMessage: sanitized.message }));
        if (!styleReady) setMapError("The interactive map could not be loaded. Check the public token restrictions. Official conditions remain available below.");
      });
      map.on("load", () => {
        setMapDiagnostics((current) => ({ ...current, styleLoaded: true, mapLoaded: true }));
      });
    }).catch((error) => { window.clearTimeout(timeout); const sanitized = sanitizeMapError(error); developmentMapError("roads", "module or initialization failed", error); setMapDiagnostics((current) => ({ ...current, mapErrorCode: sanitized.code ?? "module-load", mapErrorMessage: sanitized.message })); setMapError("The interactive map could not be loaded. Official conditions remain available below."); });
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      stopObservingSize?.();
      userMarkerRef.current?.remove();
      map?.remove();
      mapRef.current = undefined;
    };
  }, [initialData, mapConfigured]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLayersReady) return;
    const sectionFilter = filter === "closures"
      ? ["==", ["get", "status"], "closed"] as FilterSpecification
      : filter === "difficult"
        ? ["in", ["get", "status"], ["literal", ["caution", "difficult"]]] as FilterSpecification
        : ATTENTION_SECTION_FILTER;
    map.setFilter(SECTION_LAYER, sectionFilter);
    map.setLayoutProperty(SECTION_LAYER, "visibility", ["all", "closures", "difficult"].includes(filter) ? "visible" : "none");
    setLayerGroupVisibility(map, POINT_LAYER_GROUPS.incidents, filter === "all" || filter === "incidents");
    setLayerGroupVisibility(map, POINT_LAYER_GROUPS.weather, filter === "weather");
    setLayerGroupVisibility(map, POINT_LAYER_GROUPS.cameras, filter === "cameras");
  }, [filter, mapLayersReady]);

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
    incidents: initialData.incidents.length,
  }), [initialData.incidents.length, initialData.sections]);
  const unavailableLayers = [
    !initialData.sources.sections ? "road geometry" : undefined,
    !initialData.sources.conditions ? "road conditions" : undefined,
    !initialData.sources.incidents ? "incidents" : undefined,
    !initialData.sources.weather ? "roadside observations" : undefined,
    !initialData.sources.cameras ? "cameras" : undefined,
  ].filter((value): value is string => Boolean(value));
  const mapFailed = !mapConfigured || Boolean(mapError);
  const mapLoading = !mapFailed && !mapReady;

  return (
    <>
      <main className="page-shell">
        <AppHeader title="Roads" subtitle="Official conditions across Iceland" />
        <p className="mt-4 max-w-[410px] text-[12px] leading-5 text-[#95a19e]">Road sections, incidents, roadside observations and camera locations. Conditions can change quickly.</p>

        <section className="mt-5">
          <div className="grid grid-cols-3 gap-2" aria-label="Map filters">{FILTERS.map(({ id, label }) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`min-h-10 rounded-full border px-2 text-[10px] font-semibold transition ${filter === id ? "border-[#69a8a3]/45 bg-[#2d6b6b]/35 text-[#d7e5e2]" : "border-white/[.08] bg-white/[.035] text-[#8f9c99]"}`}>{label}</button>)}</div>

          <div className={`roadwise-map-frame relative mt-3 overflow-hidden rounded-[28px] ${mapFailed ? "h-auto min-h-[168px]" : "h-[min(58dvh,520px)] min-h-[390px]"}`} role="region" aria-label="Interactive Iceland road-condition map">
            <div ref={mapContainer} className="roadwise-map-canvas absolute inset-0 z-0" />
            {mapFailed ? <MapFallback diagnostics={mapDiagnostics} /> : null}
            {mapLoading ? <div className="map-skeleton absolute inset-0 z-20 flex items-center justify-center"><div className="w-full max-w-[330px] px-5 text-center"><Navigation size={25} className="mx-auto animate-pulse text-[#69a8a3]" /><p className="mt-3 text-[12px] font-medium text-[#aab3b0]">Loading map…</p><p className="mt-1 text-[10px] text-[#71807c]">Official sections and map layers</p><MapDiagnosticStatus status={mapDiagnostics} /></div></div> : null}
            {mapReady ? <button type="button" onClick={locateMe} aria-label="Locate me" className="glass absolute right-3 top-3 z-10 flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#111a1a]/90 text-[#e8c4b0]"><Crosshair size={20} /></button> : null}
            {locationStatus ? <div className="glass absolute left-3 top-3 z-10 max-w-[calc(100%-5rem)] rounded-full bg-[#111a1a]/90 px-3 py-2 text-[10px] text-[#c0c9c6]">{locationStatus}</div> : null}
            {mapLayersReady ? <div className="pointer-events-none absolute bottom-7 left-3 z-10 grid gap-1.5"><Legend color="#ef8e76" label="Road closed" /><Legend color="#d48c6b" label="Difficult conditions" /><Legend color="#e8c4b0" label="Use caution" /></div> : null}
          </div>
          <p className="mt-2 px-1 text-[9px] leading-4 text-[#778480]">A road without an overlay is not necessarily normal; an official condition record may be unavailable.</p>
        </section>

        {unavailableLayers.length > 0 ? <section className="surface-panel section-block flex gap-3 p-4"><CloudOff size={19} className="shrink-0 text-[#d48c6b]" /><p className="text-[11px] leading-5 text-[#9ca7a4]">Partial official data: {unavailableLayers.join(", ")} unavailable. Unknown data is not shown as normal.</p></section> : null}

        <AttentionSummary data={initialData} counts={counts} onSelect={setSelection} onViewAll={(nextFilter) => { setAttentionFilter(nextFilter); setAttentionOpen(true); }} />

        <section className="surface-panel section-block p-4 text-[10px] leading-5 text-[#82908d]"><div>{initialData.updatedAt ? `Official road-condition feed updated ${formatTimestamp(initialData.updatedAt)}.` : "Official road-condition update time unavailable."}</div>{initialData.sourceStale ? <div className="mt-1 text-[#d48c6b]">The road-condition source response may be stale. Confirm with Umferðin.</div> : null}</section>
        <DataAttribution />
      </main>
      {selection ? <DetailSheet selection={selection} data={initialData} onClose={() => setSelection(undefined)} /> : null}
      {attentionOpen ? <AttentionSheet data={initialData} filter={attentionFilter} onFilter={setAttentionFilter} onClose={() => setAttentionOpen(false)} onSelect={(next) => { setAttentionOpen(false); setSelection(next); }} /> : null}
      <BottomNav />
    </>
  );
}

function addRoadLayers(map: MapboxMap, data: RoadMapPayload) {
  map.addSource("roadwise-sections", { type: "geojson", data: { type: "FeatureCollection", features: data.sections.map((section) => ({ type: "Feature", id: section.id, properties: { id: section.id, status: section.status }, geometry: section.geometry })) } });
  map.addLayer({ id: SECTION_LAYER, type: "line", source: "roadwise-sections", filter: ATTENTION_SECTION_FILTER, paint: { "line-color": ["match", ["get", "status"], "closed", "#ef8e76", "difficult", "#d48c6b", "caution", "#e8c4b0", "normal", "#4d8f8a", "#74817e"], "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2, 8, 4, 12, 7], "line-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.82, 9, 1] } });
}

function addPointLayers(map: MapboxMap, data: RoadMapPayload) {
  addClusteredPoints(map, "incidents", data.incidents.map((incident) => ({ id: incident.id, coordinates: incident.coordinates, icon: incidentIcon(incident.type) })), "#d48c6b", true);
  addClusteredPoints(map, "weather", data.observations.map((observation) => ({ id: observation.id, coordinates: observation.coordinates, icon: "↗" })), "#69a8a3", false);
  addClusteredPoints(map, "cameras", data.cameras.map((camera) => ({ id: camera.id, coordinates: camera.coordinates, icon: "▣" })), "#e8c4b0", false);
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

function AttentionSummary({ data, counts, onSelect, onViewAll }: { data: RoadMapPayload; counts: { closures: number; difficult: number; incidents: number }; onSelect: (selection: Selection) => void; onViewAll: (filter: AttentionFilter) => void }) {
  const closed = sortAttentionSections(data.sections.filter((section) => section.status === "closed")).slice(0, 5);
  const difficult = sortAttentionSections(data.sections.filter((section) => section.status === "difficult" || section.status === "caution")).slice(0, 3);
  const sections = [...closed, ...difficult];
  const defaultFilter: AttentionFilter = counts.closures ? "closed" : counts.difficult ? "difficult" : "incidents";
  return <section className="section-block"><div className="mb-3 flex items-end justify-between gap-4"><div><div className="eyebrow">Official summary</div><h2 className="mt-1 text-[19px] font-semibold">Conditions needing attention</h2><p className="mt-1 text-[10px] text-[#82908d]">{counts.closures} closed · {counts.difficult} difficult / caution · {counts.incidents} incidents</p></div><button type="button" onClick={() => onViewAll(defaultFilter)} className="shrink-0 rounded-full border border-white/[.09] bg-white/[.035] px-3 py-2 text-[10px] font-semibold text-[#b7c0bd]">View all</button></div>{sections.length ? <div className="surface-group">{sections.map((section) => <SectionAttentionRow key={section.id} section={section} onClick={() => onSelect({ kind: "section", item: section })} />)}</div> : data.incidents.length ? <div className="surface-panel p-4 text-[11px] leading-5 text-[#8e9b98]">No closed or difficult sections are present. {data.incidents.length} official incident{data.incidents.length === 1 ? " is" : "s are"} available in View all.</div> : <div className="surface-panel p-4 text-[11px] leading-5 text-[#8e9b98]">No closures, difficult/caution sections or notable incidents are present in the available official data.</div>}</section>;
}

function AttentionSheet({ data, filter, onFilter, onClose, onSelect }: { data: RoadMapPayload; filter: AttentionFilter; onFilter: (filter: AttentionFilter) => void; onClose: () => void; onSelect: (selection: Selection) => void }) {
  const sections = filter === "closed" ? sortAttentionSections(data.sections.filter((section) => section.status === "closed")) : sortAttentionSections(data.sections.filter((section) => section.status === "difficult" || section.status === "caution"));
  const incidents = [...data.incidents].sort((a, b) => timestampRank(b.updatedAt) - timestampRank(a.updatedAt) || a.title.localeCompare(b.title));
  const empty = filter === "incidents" ? incidents.length === 0 : sections.length === 0;
  return <aside role="dialog" aria-modal="true" aria-label="All conditions needing attention" className="fixed inset-0 z-[70] mx-auto flex w-full max-w-[var(--app-width)] flex-col bg-[#0c1414]/[.99] px-[var(--app-gutter)] pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-[calc(14px+env(safe-area-inset-top,0px))] shadow-[0_0_80px_rgba(0,0,0,.65)]"><div className="flex min-h-12 items-center justify-between"><div><div className="eyebrow">Official road data</div><h2 className="mt-1 text-[20px] font-semibold">Conditions needing attention</h2></div><button type="button" onClick={onClose} aria-label="Close all conditions" className="glass flex h-11 w-11 items-center justify-center rounded-[17px] text-[#aab4b1]"><X size={19} /></button></div><div className="mt-4 grid grid-cols-3 gap-2">{(["closed", "difficult", "incidents"] as const).map((item) => <button type="button" key={item} onClick={() => onFilter(item)} aria-pressed={filter === item} className={`min-h-11 rounded-full border px-2 text-[10px] font-semibold capitalize ${filter === item ? "border-[#69a8a3]/45 bg-[#2d6b6b]/35 text-[#d7e5e2]" : "border-white/[.08] bg-white/[.035] text-[#8f9c99]"}`}>{item}</button>)}</div><div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">{empty ? <div className="surface-panel p-5 text-[12px] text-[#8e9b98]">No matching official records are available.</div> : <div className="surface-group">{filter === "incidents" ? incidents.map((incident) => <IncidentAttentionRow key={incident.id} incident={incident} onClick={() => onSelect({ kind: "incident", item: incident })} />) : sections.map((section) => <SectionAttentionRow key={section.id} section={section} onClick={() => onSelect({ kind: "section", item: section })} />)}</div>}</div></aside>;
}

function SectionAttentionRow({ section, onClick }: { section: RoadMapSection; onClick: () => void }) { return <button type="button" onClick={onClick} className="surface-row flex min-h-16 w-full items-center gap-3 px-2 py-3 text-left"><StatusDot status={section.status} /><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold">{roadLabel(section)}</span><span className="mt-1 block truncate text-[10px] text-[#82908d]">{section.name ?? section.comment ?? "Official section"}</span></span><span className="max-w-24 text-right text-[9px] uppercase leading-4 tracking-[.08em] text-[#9da8a5]">{roadMapStatusLabel(section.status)}</span></button>; }
function IncidentAttentionRow({ incident, onClick }: { incident: RoadMapIncident; onClick: () => void }) { return <button type="button" onClick={onClick} className="surface-row flex min-h-16 w-full items-center gap-3 px-2 py-3 text-left"><AlertTriangle size={17} className="shrink-0 text-[#d48c6b]" /><span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold">{incident.title}</span><span className="mt-1 block truncate text-[10px] text-[#82908d]">{incident.roadName ?? incident.roadNumber ?? "Official incident"}</span></span></button>; }
function sortAttentionSections(sections: RoadMapSection[]) { return [...sections].sort((a, b) => statusRank(b.status) - statusRank(a.status) || timestampRank(b.updatedAt) - timestampRank(a.updatedAt) || roadLabel(a).localeCompare(roadLabel(b), "en", { numeric: true })); }
function timestampRank(value?: string) { const parsed = value ? Date.parse(value) : 0; return Number.isFinite(parsed) ? parsed : 0; }

function DetailSheet({ selection, data, onClose }: { selection: Selection; data: RoadMapPayload; onClose: () => void }) {
  return <aside role="dialog" aria-modal="false" aria-label="Road map details" className="fixed bottom-[var(--roadwise-bottom-sheet-offset)] left-1/2 z-[80] max-h-[min(66dvh,560px)] w-[min(calc(100%-24px),456px)] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-[28px] border border-white/[.11] bg-[#101919]/[.97] shadow-[0_28px_80px_rgba(0,0,0,.58)] backdrop-blur-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[.07] bg-[#101919]/95 px-5 py-4 backdrop-blur-xl"><div className="eyebrow">Official detail</div><button type="button" onClick={onClose} aria-label="Close details" className="flex h-10 w-10 items-center justify-center rounded-[15px] bg-white/[.05] text-[#a4aeab]"><X size={18} /></button></div><div className="p-5">{selection.kind === "section" ? <SectionDetail section={selection.item} data={data} /> : selection.kind === "incident" ? <IncidentDetail incident={selection.item} /> : selection.kind === "observation" ? <ObservationDetail observation={selection.item} referenceTime={data.generatedAt} /> : <CameraDetail camera={selection.item} />}</div></aside>;
}

function SectionDetail({ section, data }: { section: RoadMapSection; data: RoadMapPayload }) {
  const nearby = matchRoadSectionDetails(section, data);
  return <><div className="flex items-start gap-3"><StatusDot status={section.status} /><div><h2 className="text-[20px] font-semibold tracking-[-.03em]">{roadLabel(section)}</h2><p className="mt-1 text-[12px] text-[#9ba6a3]">{section.name ?? "Official section name unavailable"}</p></div></div><DetailGrid items={[["Status", roadMapStatusLabel(section.status)], ["Official condition", humanState(section.officialState)], ["Updated", section.updatedAt ? formatTimestamp(section.updatedAt) : "Unavailable"], ["Freshness", section.stale ? "Stale record" : "Current feed record"]]} />{section.comment ? <DetailBlock title="Official comment">{section.comment}</DetailBlock> : null}{nearby.incidents.length ? <DetailBlock title="Relevant incidents">{nearby.incidents.map((incident) => <div key={incident.id} className="border-b border-white/[.06] py-2 last:border-0"><div className="font-semibold">{incident.title}</div><div className="mt-1 text-[#8e9b98]">{incident.description ?? "Official incident report."}</div></div>)}</DetailBlock> : null}{nearby.observation ? <DetailBlock title="Nearest roadside observation"><div className="font-semibold">{nearby.observation.name} · {nearby.observation.distanceKm.toFixed(1)} km</div><div className="mt-1 text-[#82908d]">{nearby.observation.observedAt ? observationAge(nearby.observation.observedAt, data.generatedAt) : "Observation time unavailable"}</div><ObservationValues observation={nearby.observation} /></DetailBlock> : null}{nearby.cameras.length ? <DetailBlock title="Nearby official cameras"><div className="grid gap-3">{nearby.cameras.map((camera) => <CameraCard key={camera.id} camera={camera} />)}</div></DetailBlock> : null}<SafetyCopy /></>;
}

function IncidentDetail({ incident }: { incident: RoadMapIncident }) { return <><div className="flex gap-3"><TriangleAlert size={24} className="shrink-0 text-[#d48c6b]" /><div><h2 className="text-[20px] font-semibold">{incident.title}</h2><p className="mt-1 text-[12px] text-[#8e9b98]">{incident.roadName ?? incident.roadNumber ?? "Official IRCA incident"}</p></div></div>{incident.description ? <DetailBlock title="Official comment">{incident.description}</DetailBlock> : null}<DetailGrid items={[["Type", humanState(incident.type)], ["Updated", incident.updatedAt ? formatTimestamp(incident.updatedAt) : "Unavailable"], ["Freshness", incident.stale ? "Stale record" : "Current feed record"]]} /><SafetyCopy /></>; }
function ObservationDetail({ observation, referenceTime }: { observation: RoadMapObservation; referenceTime: string }) { return <><div className="flex gap-3"><Wind size={24} className="shrink-0 text-[#69a8a3]" /><div><h2 className="text-[20px] font-semibold">{observation.name}</h2><p className="mt-1 text-[12px] text-[#8e9b98]">Roadside observation · {observation.observedAt ? observationAge(observation.observedAt, referenceTime) : "time unavailable"}</p></div></div><ObservationValues observation={observation} /><p className="mt-4 text-[11px] leading-5 text-[#82908d]">A station observation is not, by itself, a Roadwise weather warning.</p></>; }
function CameraDetail({ camera }: { camera: RoadMapCamera }) { return <><div className="flex gap-3"><Camera size={24} className="shrink-0 text-[#e8c4b0]" /><div><h2 className="text-[20px] font-semibold">{camera.name}</h2><p className="mt-1 text-[12px] text-[#8e9b98]">{camera.roadName ?? camera.roadNumber ?? camera.description ?? "Official camera location"}</p></div></div><div className="mt-4"><CameraCard camera={camera} /></div></>; }

function CameraCard({ camera }: { camera: RoadMapCamera }) { return <div className="overflow-hidden rounded-[20px] border border-white/[.08] bg-white/[.03]"><div className="relative aspect-[16/9] bg-[#080d0d]"><img src={camera.imageUrl} alt={`Road camera at ${camera.name}`} className="h-full w-full object-cover" loading="lazy" /><span className="absolute bottom-2 left-2 rounded-full bg-[#0a0f0f]/85 px-2.5 py-1.5 text-[8px] uppercase tracking-[.1em]">Latest road camera image</span></div><div className="p-3 text-[11px]"><div className="font-semibold">{camera.name}</div><div className="mt-1 text-[#82908d]">{camera.roadName ?? camera.roadNumber ?? "IRCA camera"}</div></div></div>; }
function ObservationValues({ observation }: { observation: RoadMapObservation }) { const values = observation.values; const rows = [["Wind", values.windSpeedMps, "m/s", Wind], ["Gust", values.maximumWindSpeedMps, "m/s", Gauge], ["Air", values.airTemperatureC, "°C", Thermometer], ["Road surface", values.roadSurfaceTemperatureC, "°C", Snowflake]] as const; const available = rows.filter(([, value]) => value !== undefined); return available.length ? <div className="mt-4 grid grid-cols-2 gap-2">{available.map(([label, value, unit, Icon]) => <div key={label} className="rounded-[16px] bg-white/[.04] p-3"><Icon size={15} className="text-[#69a8a3]" /><div className="mt-2 text-[10px] text-[#82908d]">{label}</div><div className="mt-0.5 text-[14px] font-semibold">{value?.toFixed(1)} {unit}</div></div>)}</div> : <p className="mt-4 text-[11px] text-[#82908d]">No supported measurement values are available.</p>; }
function DetailGrid({ items }: { items: string[][] }) { return <div className="mt-5 grid grid-cols-2 gap-2">{items.map(([label, value]) => <div key={label} className="rounded-[16px] bg-white/[.035] p-3"><div className="text-[9px] uppercase tracking-[.1em] text-[#82908d]">{label}</div><div className="mt-1 text-[11px] font-semibold capitalize">{value}</div></div>)}</div>; }
function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mt-5 border-t border-white/[.07] pt-4"><div className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#e8c4b0]">{title}</div><div className="mt-2 text-[11px] leading-5 text-[#aab3b0]">{children}</div></section>; }
function SafetyCopy() { return <p className="mt-5 text-[10px] leading-5 text-[#82908d]">Roadwise reports available official information and never determines that a road is safe.</p>; }
function MapFallback({ diagnostics }: { diagnostics: ReturnType<typeof initialMapDiagnostics> }) { return <div className="relative z-20 flex min-h-[168px] items-center justify-center bg-[#0d1515] p-5 text-center"><div className="w-full max-w-[330px]"><CloudOff size={23} className="mx-auto text-[#d48c6b]" /><div className="mt-2 text-[13px] font-semibold">Map unavailable</div><p className="mt-1 text-[10px] leading-5 text-[#82908d]">Official road information is still available below.</p><MapDiagnosticStatus status={diagnostics} /></div></div>; }
function Legend({ color, label }: { color: string; label: string }) { return <div className="glass flex w-fit items-center gap-2 rounded-full bg-[#101818]/85 px-2.5 py-1.5 text-[8px] text-[#b4bdb9]"><span className="h-1.5 w-4 rounded-full" style={{ backgroundColor: color }} />{label}</div>; }
function StatusDot({ status }: { status: RoadMapSection["status"] }) { const colors = { closed: "bg-[#ef8e76]", difficult: "bg-[#d48c6b]", caution: "bg-[#e8c4b0]", normal: "bg-[#4d8f8a]", unknown: "bg-[#74817e]" }; return <span className={`h-3 w-3 shrink-0 rounded-full ${colors[status]}`} />; }
function roadLabel(section: RoadMapSection) { return section.roadNumbers.length ? section.roadNumbers.join(" · ") : section.name ?? "Official road section"; }
function statusRank(status: RoadMapSection["status"]) { return { unknown: 0, normal: 1, caution: 2, difficult: 3, closed: 4 }[status]; }
function humanState(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase()); }
function incidentIcon(type: RoadMapIncident["type"]) { if (type === "roadworks") return "◆"; if (type === "obstructionOnTheRoad") return "!"; if (type === "flooding") return "≈"; if (type === "looseChippings") return "∴"; if (type === "accident") return "+"; if (type === "strongWinds") return "↝"; return "●"; }
function formatTimestamp(value: string) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Atlantic/Reykjavik" }).format(new Date(value)); }
function observationAge(value: string, referenceTime: string) { const minutes = Math.max(0, Math.round((Date.parse(referenceTime) - Date.parse(value)) / 60_000)); return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} hr ago`; }

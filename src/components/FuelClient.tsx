"use client";

import { BatteryCharging, ChevronRight, CloudOff, Crosshair, Fuel, MapPin, Navigation, Search, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapboxMap, MapLayerMouseEvent, Marker } from "mapbox-gl";

import BottomNav from "@/components/BottomNav";
import Logo from "@/components/Logo";
import VehicleSelector from "@/components/VehicleSelector";
import { detectLongServiceGaps, filterServicePois, matchServicePoisToRoute, nearestServicePois, routeProgressAt } from "@/lib/fuel-services";
import { readRouteAnalysis } from "@/lib/route-analysis-storage";
import type { VehicleType } from "@/types/analysis";
import type { Coordinates, GeoJsonLineString } from "@/types/road";
import type { RouteServicePoi, ServicePoi, ServicePoiSnapshot, ServicePoiType, StoredServiceRoute } from "@/types/service-poi";

type PageMode = "nearby" | "route";
type ServiceFilter = ServicePoiType | "all";
type DisplayPoi = ServicePoi & { distanceKm?: number; distanceAheadKm?: number; lateralDistanceKm?: number };

export default function FuelClient({ initialSnapshot, initialVehicle, mapConfigured }: { initialSnapshot: ServicePoiSnapshot; initialVehicle: VehicleType; mapConfigured: boolean }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | undefined>(undefined);
  const userMarker = useRef<Marker | undefined>(undefined);
  const [mode, setMode] = useState<PageMode>("nearby");
  const [vehicle, setVehicle] = useState<VehicleType>(initialVehicle);
  const [filter, setFilter] = useState<ServiceFilter>(initialVehicle === "Electric vehicle" ? "ev" : "fuel");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [location, setLocation] = useState<{ coordinates: Coordinates; accuracyMeters: number }>();
  const [locationStatus, setLocationStatus] = useState<string>();
  const [storedRoute, setStoredRoute] = useState<StoredServiceRoute>();
  const [selected, setSelected] = useState<DisplayPoi>();
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string>();

  useEffect(() => {
    const analysis = readRouteAnalysis();
    if (!analysis) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setStoredRoute({ geometry: analysis.route.geometry, distanceKm: analysis.route.distanceKm });
      setVehicle(analysis.vehicle);
      setFilter(analysis.vehicle === "Electric vehicle" ? "ev" : "fuel");
    });
    return () => { active = false; };
  }, []);

  const preferredType: ServicePoiType = vehicle === "Electric vehicle" ? "ev" : "fuel";
  const currentRouteKm = useMemo(() => storedRoute && location ? routeProgressAt(storedRoute.geometry, location.coordinates) : undefined, [location, storedRoute]);
  const routeMatches = useMemo(() => storedRoute ? matchServicePoisToRoute({ route: storedRoute.geometry, pois: initialSnapshot.data, filter, currentRouteKm }) : [], [currentRouteKm, filter, initialSnapshot.data, storedRoute]);
  const nearby = useMemo(() => location ? nearestServicePois(location.coordinates, initialSnapshot.data, filter) : [], [filter, initialSnapshot.data, location]);
  const searchedPois = useMemo(() => {
    const source: DisplayPoi[] = mode === "nearby" ? nearby : routeMatches;
    const normalized = query.trim().toLocaleLowerCase("is");
    return normalized ? source.filter((poi) => `${poi.name} ${poi.provider ?? ""}`.toLocaleLowerCase("is").includes(normalized)) : source;
  }, [mode, nearby, query, routeMatches]);
  const mapPois = useMemo(() => {
    const filtered = filterServicePois(initialSnapshot.data, filter);
    const normalized = query.trim().toLocaleLowerCase("is");
    return normalized ? filtered.filter((poi) => `${poi.name} ${poi.provider ?? ""}`.toLocaleLowerCase("is").includes(normalized)) : filtered;
  }, [filter, initialSnapshot.data, query]);
  const summaryType = filter === "all" ? preferredType : filter;
  const summaryMatches = useMemo(() => storedRoute ? matchServicePoisToRoute({ route: storedRoute.geometry, pois: initialSnapshot.data, filter: summaryType, currentRouteKm }) : [], [currentRouteKm, initialSnapshot.data, storedRoute, summaryType]);
  const longGaps = useMemo(() => storedRoute ? detectLongServiceGaps({ routeDistanceKm: storedRoute.distanceKm, matchedPois: summaryMatches, type: summaryType, currentRouteKm }) : [], [currentRouteKm, storedRoute, summaryMatches, summaryType]);
  const selectedWithDistance = selected
    ? (mode === "nearby" ? nearby : routeMatches).find((poi) => poi.id === selected.id) ?? selected
    : undefined;

  useEffect(() => {
    if (!mapConfigured || !mapContainer.current || mapRef.current || !initialSnapshot.available) return;
    let disposed = false;
    let map: MapboxMap | undefined;
    void import("mapbox-gl").then(({ default: mapboxgl }) => {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
      if (!token || disposed || !mapContainer.current) return;
      map = new mapboxgl.Map({ container: mapContainer.current, accessToken: token, style: "mapbox://styles/mapbox/dark-v11", center: [-18.8, 64.85], zoom: 4.65, minZoom: 4, maxZoom: 16, attributionControl: false });
      mapRef.current = map;
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
      map.on("error", () => { if (map && !map.isStyleLoaded()) setMapError("The service map could not be loaded. The station list remains available."); });
      map.on("load", () => {
        if (!map) return;
        for (const layer of map.getStyle().layers ?? []) if (layer.type === "symbol" && /(poi|transit|airport)/i.test(layer.id)) map.setLayoutProperty(layer.id, "visibility", "none");
        map.addSource("service-pois", { type: "geojson", cluster: true, clusterMaxZoom: 9, clusterRadius: 45, data: poiFeatureCollection(initialSnapshot.data) });
        map.addLayer({ id: "service-clusters", type: "circle", source: "service-pois", filter: ["has", "point_count"], paint: { "circle-color": "#172424", "circle-stroke-color": "#69a8a3", "circle-stroke-width": 1.5, "circle-radius": ["step", ["get", "point_count"], 15, 15, 19, 50, 23] } });
        map.addLayer({ id: "service-cluster-count", type: "symbol", source: "service-pois", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 10 }, paint: { "text-color": "#f5f1eb" } });
        map.addLayer({ id: "service-points", type: "symbol", source: "service-pois", filter: ["!", ["has", "point_count"]], layout: { "text-field": ["get", "icon"], "text-size": 14, "text-allow-overlap": false }, paint: { "text-color": ["match", ["get", "type"], "ev", "#69a8a3", "#d48c6b"], "text-halo-color": "#101818", "text-halo-width": 2 } });
        map.addSource("service-route", { type: "geojson", data: emptyFeatureCollection() });
        map.addLayer({ id: "service-route-line", type: "line", source: "service-route", paint: { "line-color": "#69a8a3", "line-width": 3, "line-opacity": 0.72, "line-dasharray": [2, 1.5] } });
        bindServiceMap(map, initialSnapshot.data, setSelected);
        setMapReady(true);
      });
    }).catch(() => setMapError("The service map could not be loaded. The station list remains available."));
    return () => { disposed = true; userMarker.current?.remove(); map?.remove(); mapRef.current = undefined; };
  }, [initialSnapshot.available, initialSnapshot.data, mapConfigured]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    (map.getSource("service-pois") as GeoJSONSource).setData(poiFeatureCollection(mapPois));
  }, [mapPois, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const source = map.getSource("service-route") as GeoJSONSource;
    source.setData(storedRoute ? { type: "Feature", properties: {}, geometry: storedRoute.geometry } : emptyFeatureCollection());
    map.setLayoutProperty("service-route-line", "visibility", mode === "route" && storedRoute ? "visible" : "none");
    if (mode === "route" && storedRoute) fitRoute(map, storedRoute.geometry);
  }, [mapReady, mode, storedRoute]);

  function changeVehicle(next: VehicleType) {
    setVehicle(next);
    setFilter(next === "Electric vehicle" ? "ev" : "fuel");
  }

  function locate() {
    const map = mapRef.current;
    if (!navigator.geolocation) { setLocationStatus("Location is unavailable in this browser."); return; }
    setLocationStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(async (position) => {
      const coordinates: Coordinates = [position.coords.longitude, position.coords.latitude];
      setLocation({ coordinates, accuracyMeters: position.coords.accuracy });
      setLocationStatus(`Location found · approximately ±${Math.round(position.coords.accuracy)} m`);
      if (map) {
        const { default: mapboxgl } = await import("mapbox-gl");
        userMarker.current?.remove();
        userMarker.current = new mapboxgl.Marker({ color: "#e8c4b0" }).setLngLat(coordinates).addTo(map);
        map.easeTo({ center: coordinates, zoom: Math.max(10, map.getZoom()), duration: 800 });
      }
    }, (error) => setLocationStatus(error.code === error.PERMISSION_DENIED ? "Location permission was denied." : "Your location could not be found."), { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 });
  }

  return <><main className="page-shell"><Logo /><header className="section-block-lg"><div className="eyebrow">Fuel / EV</div><h1 className="mt-2 text-[32px] font-semibold tracking-[-0.05em]">Useful stops, without guesswork.</h1><p className="mt-3 max-w-[390px] text-[13px] leading-6 text-[#95a19e]">Find Roadwise-listed fuel stations and EV chargers nearby or close to your last checked route.</p></header>

    {!initialSnapshot.available ? <section className="surface-panel section-block flex gap-3 p-4"><CloudOff size={20} className="shrink-0 text-[#d48c6b]" /><div><div className="text-[13px] font-semibold">Service-stop data unavailable</div><p className="mt-1 text-[11px] leading-5 text-[#8e9b98]">{initialSnapshot.error ?? "OpenStreetMap fuel and charging data could not be loaded."} No substitute stations are shown.</p></div></section> : null}

    <section className="section-block"><VehicleSelector vehicle={vehicle} onChange={changeVehicle} /></section>
    <section className="section-block"><div className="grid grid-cols-2 gap-2 rounded-[22px] border border-white/[.07] bg-white/[.025] p-1.5"><ModeButton active={mode === "nearby"} onClick={() => setMode("nearby")} label="Nearby" icon={<Crosshair size={16} />} /><ModeButton active={mode === "route"} onClick={() => setMode("route")} label="Along route" icon={<Navigation size={16} />} /></div><div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><FilterButton active={filter === "fuel"} onClick={() => setFilter("fuel")} label="Fuel" icon={<Fuel size={15} />} /><FilterButton active={filter === "ev"} onClick={() => setFilter("ev")} label="EV chargers" icon={<BatteryCharging size={15} />} /><FilterButton active={filter === "all"} onClick={() => setFilter("all")} label="All services" icon={<MapPin size={15} />} /></div></section>

    <section className="section-block"><div className="roadwise-focus-shell glass flex min-h-14 items-center gap-3 rounded-[22px] px-4"><Search size={17} className="text-[#69a8a3]" /><input value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} aria-label="Search fuel or charging stations" placeholder="Search station or provider" className="destination-input roadwise-focus-scroll min-w-0 flex-1 border-0 bg-transparent py-3 text-[13px] outline-none ring-0 focus:border-transparent focus:outline-none focus:ring-0" /></div></section>

    {mode === "nearby" || storedRoute ? <section className="section-block"><button type="button" onClick={locate} className="primary-button min-h-14">{mode === "nearby" ? "Use my location" : location ? "Update route position" : "Use my location for route position"} <Crosshair size={18} /></button>{locationStatus ? <p className="mt-2 text-center text-[10px] text-[#8e9b98]">{locationStatus}</p> : null}</section> : null}

    {mode === "route" && storedRoute ? <RouteSummary type={summaryType} matches={summaryMatches} gaps={longGaps} /> : null}

    <section className="section-block"><div className="glass relative h-[min(52dvh,470px)] min-h-[350px] overflow-hidden rounded-[28px]"><div ref={mapContainer} className="absolute inset-0" />{!mapConfigured || mapError || !initialSnapshot.available ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-[radial-gradient(circle_at_50%_42%,rgba(45,107,107,.22),#0d1515_68%)] p-8 text-center"><div><CloudOff size={25} className="mx-auto text-[#d48c6b]" /><div className="mt-3 text-[13px] font-semibold">Map unavailable</div><p className="mt-2 text-[10px] leading-5 text-[#82908d]">{mapError ?? (!mapConfigured ? "A restricted public Mapbox token is required. The list remains available." : "Service-stop data is unavailable.")}</p></div></div> : null}{mapConfigured && initialSnapshot.available && !mapReady && !mapError ? <div className="absolute inset-0 flex items-center justify-center bg-[#0d1515]"><Navigation size={23} className="animate-pulse text-[#69a8a3]" /></div> : null}</div></section>

    <section className="section-block"><div className="mb-3 flex items-end justify-between"><div><div className="eyebrow">{mode === "nearby" ? "Nearby services" : "Driving order"}</div><h2 className="mt-1 text-[19px] font-semibold">{mode === "nearby" ? "Closest useful stops" : "Along your checked route"}</h2></div>{searchedPois.length ? <span className="text-[10px] text-[#82908d]">{searchedPois.length} listed</span> : null}</div><ServiceList mode={mode} hasLocation={Boolean(location)} hasRoute={Boolean(storedRoute)} sourceAvailable={initialSnapshot.available} pois={searchedPois} onSelect={setSelected} /></section>

    <section className="surface-panel section-block p-4 text-[10px] leading-5 text-[#82908d]"><p>Fuel and charging POIs: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="text-[#a9c9c5] underline underline-offset-2">© OpenStreetMap contributors</a>, available under ODbL. Community mapping may be incomplete or outdated.</p><p className="mt-1">Roadwise does not provide live charger availability, fuel inventory or prices. Verify listed opening, connector and output details with the provider.</p>{initialSnapshot.updatedAt ? <p className="mt-1">Source snapshot: {formatTimestamp(initialSnapshot.updatedAt)}.</p> : null}</section>
  </main>{selectedWithDistance ? <PoiDetail poi={selectedWithDistance} onClose={() => setSelected(undefined)} /> : null}<BottomNav hidden={searchFocused} /></>;
}

function ModeButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) { return <button type="button" onClick={onClick} aria-pressed={active} className={`flex min-h-12 items-center justify-center gap-2 rounded-[17px] text-[12px] font-semibold ${active ? "bg-[#2d6b6b]/28 text-[#d9e6e3]" : "text-[#82908d]"}`}>{icon}{label}</button>; }
function FilterButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) { return <button type="button" onClick={onClick} aria-pressed={active} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[11px] font-semibold ${active ? "border-[#69a8a3]/40 bg-[#2d6b6b]/28 text-[#d9e6e3]" : "border-white/[.08] bg-white/[.03] text-[#82908d]"}`}>{icon}{label}</button>; }

function RouteSummary({ type, matches, gaps }: { type: ServicePoiType; matches: RouteServicePoi[]; gaps: ReturnType<typeof detectLongServiceGaps> }) { const next = matches[0]; const longest = [...gaps].sort((a, b) => b.distanceKm - a.distanceKm)[0]; return <section className="section-block grid gap-2.5"><div className="glass card flex items-center gap-4 p-4"><span className="flex h-11 w-11 items-center justify-center rounded-[17px] bg-[#2d6b6b]/18 text-[#69a8a3]">{type === "ev" ? <Zap size={20} /> : <Fuel size={20} />}</span><div><div className="text-[10px] uppercase tracking-[.12em] text-[#82908d]">Next {type === "ev" ? "EV charger" : "fuel station"}</div><div className="mt-1 text-[18px] font-semibold">{next ? `${Math.round(next.distanceAheadKm)} km` : "No route match"}</div></div></div>{longest ? <div className="surface-panel flex gap-3 border-[#d48c6b]/20 p-4"><TriangleIcon /><div><div className="text-[13px] font-semibold text-[#e8c4b0]">Long {type === "ev" ? "charging" : "fuel"} gap ahead</div><p className="mt-1 text-[11px] leading-5 text-[#9ca7a4]">No Roadwise-listed {type === "ev" ? "EV charger" : "fuel station"} found for approximately {Math.round(longest.distanceKm)} km.</p></div></div> : null}</section>; }
function TriangleIcon() { return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-[#7a3b2e]/18 text-[#d48c6b]">!</span>; }

function ServiceList({ mode, hasLocation, hasRoute, sourceAvailable, pois, onSelect }: { mode: PageMode; hasLocation: boolean; hasRoute: boolean; sourceAvailable: boolean; pois: DisplayPoi[]; onSelect: (poi: DisplayPoi) => void }) {
  if (!sourceAvailable) return <EmptyState text="Fuel and charging data is temporarily unavailable." />;
  if (mode === "nearby" && !hasLocation) return <EmptyState text="Use my location to order Roadwise-listed services by distance." />;
  if (mode === "route" && !hasRoute) return <EmptyState text="Check a drive first to see services along your route." />;
  if (!pois.length) return <EmptyState text="No matching Roadwise-listed service was found for this view. The source may be incomplete." />;
  return <div className="surface-group">{pois.map((poi) => <button type="button" key={poi.id} onClick={() => onSelect(poi)} className="surface-row flex min-h-[76px] w-full items-center gap-3 px-2 py-3 text-left"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] ${poi.type === "ev" ? "bg-[#2d6b6b]/18 text-[#69a8a3]" : "bg-[#7a3b2e]/14 text-[#d48c6b]"}`}>{poi.type === "ev" ? <BatteryCharging size={19} /> : <Fuel size={19} />}</span><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{poi.name}</span><span className="mt-1 block truncate text-[10px] text-[#82908d]">{poi.provider ?? (poi.type === "ev" ? "EV charging" : "Fuel station")}</span></span><span className="shrink-0 text-right"><span className="block text-[12px] font-semibold text-[#c0c9c6]">{poi.distanceAheadKm !== undefined ? `${formatDistance(poi.distanceAheadKm)} ahead` : poi.distanceKm !== undefined ? formatDistance(poi.distanceKm) : ""}</span>{poi.lateralDistanceKm !== undefined ? <span className="mt-1 block text-[9px] text-[#82908d]">{formatDistance(poi.lateralDistanceKm)} off route</span> : null}</span><ChevronRight size={15} className="shrink-0 text-[#64716e]" /></button>)}</div>;
}

function PoiDetail({ poi, onClose }: { poi: DisplayPoi; onClose: () => void }) { return <aside role="dialog" aria-label="Service stop details" className="fixed bottom-[var(--roadwise-bottom-sheet-offset)] left-1/2 z-[80] max-h-[min(66dvh,560px)] w-[min(calc(100%-24px),456px)] -translate-x-1/2 overflow-y-auto rounded-[28px] border border-white/[.11] bg-[#101919]/[.97] shadow-[0_28px_80px_rgba(0,0,0,.58)] backdrop-blur-2xl"><div className="sticky top-0 flex items-center justify-between border-b border-white/[.07] bg-[#101919]/95 px-5 py-4"><div className="eyebrow">Roadwise-listed stop</div><button type="button" onClick={onClose} aria-label="Close service details" className="flex h-10 w-10 items-center justify-center rounded-[15px] bg-white/[.05]"><X size={18} /></button></div><div className="p-5"><div className="flex gap-3"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] ${poi.type === "ev" ? "bg-[#2d6b6b]/18 text-[#69a8a3]" : "bg-[#7a3b2e]/15 text-[#d48c6b]"}`}>{poi.type === "ev" ? <BatteryCharging size={22} /> : <Fuel size={22} />}</span><div><h2 className="text-[20px] font-semibold">{poi.name}</h2><p className="mt-1 text-[12px] text-[#8e9b98]">{poi.provider ?? (poi.type === "ev" ? "EV charging station" : "Fuel station")}</p></div></div><DetailRow label="Distance" value={poi.distanceAheadKm !== undefined ? `Approximately ${formatDistance(poi.distanceAheadKm)} ahead · ${formatDistance(poi.lateralDistanceKm ?? 0)} off route` : poi.distanceKm !== undefined ? `Approximately ${formatDistance(poi.distanceKm)} away` : "Use your location or check a drive to calculate distance."} />{poi.openingHours ? <DetailRow label="Listed opening hours" value={poi.openingHours} /> : null}{poi.access ? <DetailRow label="Mapped access" value={poi.access} /> : null}{poi.fuelTypes.length ? <DetailRow label="Mapped fuel types" value={poi.fuelTypes.join(" · ")} /> : null}{poi.stationOutput ? <DetailRow label="Mapped station output" value={poi.stationOutput} /> : null}{poi.connectors.length ? <div className="mt-5"><div className="text-[9px] uppercase tracking-[.12em] text-[#e8c4b0]">Mapped connectors</div><div className="mt-2 grid gap-2">{poi.connectors.map((connector) => <div key={`${connector.type}-${connector.output ?? ""}`} className="rounded-[16px] bg-white/[.04] p-3 text-[11px]"><span className="font-semibold">{connector.type}</span>{connector.count ? ` · ${connector.count}` : ""}{connector.output ? ` · ${connector.output}` : ""}</div>)}</div></div> : null}<a href={mapsLink(poi.coordinates)} target="_blank" rel="noreferrer" className="primary-button mt-5 min-h-14">Open in Maps <MapPin size={18} /></a><p className="mt-4 text-[10px] leading-5 text-[#82908d]">OpenStreetMap listing. Verify access, hours, connector details and service availability with the provider.</p></div></aside>; }
function DetailRow({ label, value }: { label: string; value: string }) { return <div className="mt-4 border-t border-white/[.07] pt-4"><div className="text-[9px] uppercase tracking-[.12em] text-[#82908d]">{label}</div><div className="mt-1 text-[12px] leading-5 text-[#c1cac7]">{value}</div></div>; }
function EmptyState({ text }: { text: string }) { return <div className="surface-panel p-5 text-[12px] leading-6 text-[#8e9b98]">{text}</div>; }

function bindServiceMap(map: MapboxMap, pois: ServicePoi[], select: (poi: DisplayPoi) => void) { map.on("click", "service-points", (event: MapLayerMouseEvent) => { const id = event.features?.[0]?.properties?.id; const poi = pois.find((item) => item.id === id); if (poi) select(poi); }); map.on("click", "service-clusters", (event: MapLayerMouseEvent) => { const feature = event.features?.[0]; const clusterId = Number(feature?.properties?.cluster_id); const coordinates = feature?.geometry.type === "Point" ? feature.geometry.coordinates : undefined; if (!coordinates || !Number.isFinite(clusterId)) return; (map.getSource("service-pois") as GeoJSONSource).getClusterExpansionZoom(clusterId, (error, zoom) => { if (!error && zoom !== null && zoom !== undefined) map.easeTo({ center: coordinates as Coordinates, zoom, duration: 500 }); }); }); for (const layer of ["service-points", "service-clusters"]) { map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; }); } }
function poiFeatureCollection(pois: ServicePoi[]) { return { type: "FeatureCollection" as const, features: pois.map((poi) => ({ type: "Feature" as const, id: poi.id, properties: { id: poi.id, type: poi.type, icon: poi.type === "ev" ? "⚡" : "F" }, geometry: { type: "Point" as const, coordinates: poi.coordinates } })) }; }
function emptyFeatureCollection() { return { type: "FeatureCollection" as const, features: [] }; }
function fitRoute(map: MapboxMap, route: GeoJsonLineString) { const longitudes = route.coordinates.map(([longitude]) => longitude); const latitudes = route.coordinates.map(([, latitude]) => latitude); map.fitBounds([[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]], { padding: 42, duration: 700 }); }
function mapsLink([longitude, latitude]: Coordinates) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude.toFixed(6)},${longitude.toFixed(6)}`)}`; }
function formatDistance(value: number) { return value < 1 ? `${Math.round(value * 1_000)} m` : `${Math.round(value)} km`; }
function formatTimestamp(value: string) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Atlantic/Reykjavik" }).format(new Date(value)); }

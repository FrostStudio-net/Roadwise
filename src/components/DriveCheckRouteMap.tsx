"use client";

import { CloudOff, Navigation, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap, Marker } from "mapbox-gl";

import MapDiagnosticStatus from "@/components/MapDiagnosticStatus";
import { developmentMapError, initialMapDiagnostics, mapCanvasSize, mapContainerHasSize, observeMapSize, publicMapboxToken, ROADWISE_MAP_STYLE, sanitizeMapError } from "@/lib/client-map";
import { routeWarningMarkers } from "@/lib/drive-check-map";
import type { RouteWarning } from "@/types/analysis";
import type { Coordinates, GeoJsonLineString } from "@/types/road";

export default function DriveCheckRouteMap({ route, warnings, originName, destinationName }: {
  route: GeoJsonLineString;
  warnings: RouteWarning[];
  originName: string;
  destinationName: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | undefined>(undefined);
  const markersRef = useRef<Marker[]>([]);
  const tokenConfigured = Boolean(publicMapboxToken());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedWarning, setSelectedWarning] = useState<RouteWarning>();
  const [diagnostics, setDiagnostics] = useState(() => initialMapDiagnostics(tokenConfigured));
  const warningMarkers = useMemo(() => routeWarningMarkers(route, warnings), [route, warnings]);

  useEffect(() => {
    if (!tokenConfigured || !containerRef.current || mapRef.current) return;
    let disposed = false;
    let map: MapboxMap | undefined;
    let stopObservingSize: (() => void) | undefined;
    let styleReady = false;
    const timeout = window.setTimeout(() => {
      if (styleReady) return;
      developmentMapError("drive-check", "initialization timed out");
      setDiagnostics((current) => ({ ...current, mapErrorCode: "timeout", mapErrorMessage: "Map style did not load within 12 seconds." }));
      setError("The route map took too long to load.");
    }, 12_000);

    void import("mapbox-gl").then(({ default: mapboxgl }) => {
      const token = publicMapboxToken();
      const container = containerRef.current;
      if (!token) {
        window.clearTimeout(timeout);
        setDiagnostics((current) => ({ ...current, mapErrorCode: "token-missing", mapErrorMessage: "NEXT_PUBLIC_MAPBOX_TOKEN was not configured at build time." }));
        setError("A restricted public Mapbox token is required.");
        return;
      }
      if (disposed || !container) return;
      const bounds = container.getBoundingClientRect();
      setDiagnostics((current) => ({ ...current, tokenConfigured: true, containerWidth: Math.round(bounds.width), containerHeight: Math.round(bounds.height) }));
      const webglSupported = mapboxgl.supported();
      setDiagnostics((current) => ({ ...current, webglSupported }));
      if (!webglSupported || !mapContainerHasSize(container)) {
        window.clearTimeout(timeout);
        setDiagnostics((current) => ({ ...current, mapErrorCode: webglSupported ? "container-size" : "webgl-unsupported", mapErrorMessage: webglSupported ? `Map container measured ${Math.round(bounds.width)}×${Math.round(bounds.height)}.` : "Mapbox GL reported that WebGL is unavailable." }));
        setError(webglSupported ? "The route map could not be sized." : "This browser does not support the WebGL map.");
        return;
      }
      try {
        map = new mapboxgl.Map({ container, accessToken: token, style: ROADWISE_MAP_STYLE, center: route.coordinates[0], zoom: 6, minZoom: 4, maxZoom: 16, attributionControl: false });
      } catch (mapError) {
        window.clearTimeout(timeout);
        const sanitized = sanitizeMapError(mapError);
        developmentMapError("drive-check", "constructor failed", mapError);
        setDiagnostics((current) => ({ ...current, mapErrorCode: sanitized.code ?? "constructor", mapErrorMessage: sanitized.message }));
        setError("The route map could not be initialized.");
        return;
      }
      mapRef.current = map;
      setDiagnostics((current) => ({ ...current, mapCreated: true, ...mapCanvasSize(map!) }));
      stopObservingSize = observeMapSize(map, container, (size) => setDiagnostics((current) => ({ ...current, ...size })));
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
      map.on("style.load", () => {
        if (!map || styleReady) return;
        styleReady = true;
        window.clearTimeout(timeout);
        try {
          for (const layer of map.getStyle().layers ?? []) if (layer.type === "symbol" && /(poi|transit|airport)/i.test(layer.id)) map.setLayoutProperty(layer.id, "visibility", "none");
          map.addSource("checked-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: route } });
          map.addLayer({ id: "checked-route-shadow", type: "line", source: "checked-route", paint: { "line-color": "#071010", "line-width": 7, "line-opacity": 0.72 } });
          map.addLayer({ id: "checked-route-line", type: "line", source: "checked-route", paint: { "line-color": "#69a8a3", "line-width": 3.5, "line-opacity": 0.94 } });
          markersRef.current = [
            endpointMarker(mapboxgl, map, route.coordinates[0], "start", `Route start: ${originName}`),
            endpointMarker(mapboxgl, map, route.coordinates[route.coordinates.length - 1], "end", `Destination: ${destinationName}`),
            ...warningMarkers.map(({ warning, coordinates }) => warningMarker(mapboxgl, map!, coordinates, warning, setSelectedWarning)),
          ];
          fitRoute(map, route);
          map.resize();
          setError(undefined);
          setReady(true);
          setDiagnostics((current) => ({ ...current, styleLoaded: true, ...mapCanvasSize(map!) }));
        } catch (layerError) {
          const sanitized = sanitizeMapError(layerError);
          developmentMapError("drive-check", "route layer setup failed", layerError);
          setDiagnostics((current) => ({ ...current, mapErrorCode: sanitized.code ?? "layer-setup", mapErrorMessage: sanitized.message }));
          setError("The route could not be drawn on the map.");
        }
      });
      map.on("load", () => setDiagnostics((current) => ({ ...current, mapLoaded: true, styleLoaded: true })));
      map.on("error", (event) => {
        const sanitized = sanitizeMapError(event.error);
        developmentMapError("drive-check", "Mapbox GL error", event.error);
        setDiagnostics((current) => ({ ...current, mapErrorCode: sanitized.code, mapErrorMessage: sanitized.message }));
        if (!styleReady) setError("The route map could not be loaded.");
      });
    }).catch((moduleError) => {
      window.clearTimeout(timeout);
      const sanitized = sanitizeMapError(moduleError);
      developmentMapError("drive-check", "module load failed", moduleError);
      setDiagnostics((current) => ({ ...current, mapErrorCode: sanitized.code ?? "module-load", mapErrorMessage: sanitized.message }));
      setError("The route map could not be loaded.");
    });

    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      stopObservingSize?.();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map?.remove();
      mapRef.current = undefined;
    };
  }, [destinationName, originName, route, tokenConfigured, warningMarkers]);

  const failed = Boolean(error) || !tokenConfigured;
  return <section className="motion-state-enter section-block"><div className="mb-3 flex items-end justify-between"><div><div className="eyebrow">Route overview</div><h2 className="mt-1 text-[18px] font-semibold">Your checked route</h2></div>{warningMarkers.length > 0 ? <div className="text-[10px] text-[#82908d]">{warningMarkers.length} reported marker{warningMarkers.length === 1 ? "" : "s"}</div> : null}</div><div className={`roadwise-map-frame drive-check-map relative overflow-hidden rounded-[26px] ${failed ? "min-h-[164px]" : "h-[clamp(230px,32dvh,290px)]"}`} role="region" aria-label={`Interactive route map from ${originName} to ${destinationName}`}><div ref={containerRef} className="roadwise-map-canvas absolute inset-0 z-0" />{!failed && !ready ? <div className="map-skeleton motion-skeleton absolute inset-0 z-20 flex items-center justify-center"><div className="text-center"><Navigation size={22} className="breathing mx-auto text-[#69a8a3]" /><p className="mt-3 text-[12px] text-[#aab3b0]">Loading route map…</p>{process.env.NODE_ENV === "development" ? <MapDiagnosticStatus status={diagnostics} /> : null}</div></div> : null}{failed ? <div className="motion-state-enter relative z-20 flex min-h-[164px] items-center justify-center bg-[#0d1515] p-5 text-center"><div><CloudOff size={22} className="mx-auto text-[#82908d]" /><div className="mt-2 text-[13px] font-semibold">Route map unavailable</div><p className="mt-1 text-[10px] leading-5 text-[#82908d]">Your official route analysis is still available below.</p>{process.env.NODE_ENV === "development" ? <MapDiagnosticStatus status={diagnostics} /> : null}</div></div> : null}{selectedWarning ? <WarningDetail warning={selectedWarning} onClose={() => setSelectedWarning(undefined)} /> : null}</div></section>;
}

function endpointMarker(mapboxgl: typeof import("mapbox-gl")["default"], map: MapboxMap, coordinates: Coordinates, kind: "start" | "end", label: string): Marker {
  const element = document.createElement("div");
  element.className = `route-map-endpoint route-map-endpoint-${kind}`;
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", label);
  element.title = label;
  return new mapboxgl.Marker({ element }).setLngLat(coordinates).addTo(map);
}

function warningMarker(mapboxgl: typeof import("mapbox-gl")["default"], map: MapboxMap, coordinates: Coordinates, warning: RouteWarning, select: (warning: RouteWarning) => void): Marker {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `route-map-warning route-map-warning-${warning.severity}`;
  element.setAttribute("aria-label", `${warning.title}${warning.distanceAheadKm !== undefined ? `, ${warning.distanceAheadKm.toFixed(1)} kilometres from the start` : ""}`);
  element.title = warning.title;
  element.textContent = warning.severity === "closed" ? "×" : "!";
  element.addEventListener("click", (event) => { event.stopPropagation(); select(warning); });
  return new mapboxgl.Marker({ element }).setLngLat(coordinates).addTo(map);
}

function WarningDetail({ warning, onClose }: { warning: RouteWarning; onClose: () => void }) {
  const road = [warning.roadNumber, warning.roadName].filter(Boolean).join(" · ");
  return <aside className="motion-popover absolute inset-x-3 bottom-3 z-30 rounded-[19px] border border-white/[.1] bg-[#101919]/[.98] p-4 shadow-[0_16px_45px_rgba(0,0,0,.55)]" aria-label="Route warning details"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="text-[13px] font-semibold">{warning.title}</div><div className="mt-1 text-[9px] uppercase tracking-[.08em] text-[#82908d]">{warning.distanceAheadKm !== undefined ? `${warning.distanceAheadKm.toFixed(1)} km from start · ` : ""}{road || warning.source}</div></div><button type="button" onClick={onClose} aria-label="Close warning details" className="motion-press flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-white/[.05]"><X size={16} /></button></div><p className="mt-2 line-clamp-3 text-[10px] leading-4 text-[#a5afac]">{warning.officialComment ?? warning.description}</p><div className="mt-2 text-[9px] text-[#71807c]">Source: {warning.source}</div></aside>;
}

function fitRoute(map: MapboxMap, route: GeoJsonLineString) {
  const longitudes = route.coordinates.map(([longitude]) => longitude);
  const latitudes = route.coordinates.map(([, latitude]) => latitude);
  map.fitBounds([[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]], { padding: { top: 38, right: 36, bottom: 48, left: 36 }, duration: 0 });
}

import distance from "@turf/distance";
import { lineString, point } from "@turf/helpers";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import pointToLineDistance from "@turf/point-to-line-distance";

import type { Coordinates, GeoJsonLineString } from "@/types/road";
import type { NearbyServicePoi, RouteServicePoi, ServiceGap, ServicePoi, ServicePoiSnapshot, ServicePoiType, StoredServiceRoute } from "@/types/service-poi";

export const FUEL_SERVICE_CONFIG = {
  routeCorridorKm: 5,
  passedToleranceKm: 0.5,
  nearbyLimit: 30,
  longGapKm: { fuel: 100, ev: 80 },
} as const;

export type FuelPageState = "ready" | "no-route" | "source-unavailable";

export function filterServicePois<T extends ServicePoi>(pois: T[], filter: ServicePoiType | "all"): T[] {
  return filter === "all" ? pois : pois.filter((poi) => poi.type === filter);
}

export function nearestServicePois(
  origin: Coordinates,
  pois: ServicePoi[],
  filter: ServicePoiType | "all",
  limit: number = FUEL_SERVICE_CONFIG.nearbyLimit,
): NearbyServicePoi[] {
  return filterServicePois(pois, filter)
    .map((poi) => ({ ...poi, distanceKm: distance(point(origin), point(poi.coordinates), { units: "kilometers" }) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export function routeProgressAt(route: GeoJsonLineString, coordinates: Coordinates, maximumLateralKm = FUEL_SERVICE_CONFIG.routeCorridorKm): number | undefined {
  const routeLine = lineString(route.coordinates);
  const lateralKm = pointToLineDistance(point(coordinates), routeLine, { units: "kilometers" });
  if (lateralKm > maximumLateralKm) return undefined;
  return nearestPointOnLine(routeLine, point(coordinates), { units: "kilometers" }).properties.location;
}

export function matchServicePoisToRoute(input: {
  route: GeoJsonLineString;
  pois: ServicePoi[];
  filter: ServicePoiType | "all";
  currentRouteKm?: number;
  corridorKm?: number;
}): RouteServicePoi[] {
  const routeLine = lineString(input.route.coordinates);
  const currentRouteKm = input.currentRouteKm ?? 0;
  const corridorKm = input.corridorKm ?? FUEL_SERVICE_CONFIG.routeCorridorKm;
  return filterServicePois(input.pois, input.filter).flatMap((poi): RouteServicePoi[] => {
    const candidate = point(poi.coordinates);
    const lateralDistanceKm = pointToLineDistance(candidate, routeLine, { units: "kilometers" });
    if (lateralDistanceKm > corridorKm) return [];
    const routePositionKm = nearestPointOnLine(routeLine, candidate, { units: "kilometers" }).properties.location ?? 0;
    if (routePositionKm < currentRouteKm - FUEL_SERVICE_CONFIG.passedToleranceKm) return [];
    return [{
      ...poi,
      lateralDistanceKm,
      routePositionKm,
      distanceAheadKm: Math.max(0, routePositionKm - currentRouteKm),
    }];
  }).sort((a, b) => a.routePositionKm - b.routePositionKm || a.lateralDistanceKm - b.lateralDistanceKm);
}

export function detectLongServiceGaps(input: {
  routeDistanceKm: number;
  matchedPois: RouteServicePoi[];
  type: ServicePoiType;
  currentRouteKm?: number;
  thresholdKm?: number;
}): ServiceGap[] {
  const start = Math.max(0, input.currentRouteKm ?? 0);
  const threshold = input.thresholdKm ?? FUEL_SERVICE_CONFIG.longGapKm[input.type];
  const positions = input.matchedPois
    .filter((poi) => poi.type === input.type && poi.routePositionKm >= start)
    .map((poi) => poi.routePositionKm)
    .sort((a, b) => a - b);
  const boundaries = [start, ...positions, Math.max(start, input.routeDistanceKm)];
  return boundaries.slice(1).flatMap((toRouteKm, index): ServiceGap[] => {
    const fromRouteKm = boundaries[index];
    const gap = toRouteKm - fromRouteKm;
    return gap >= threshold ? [{ fromRouteKm, toRouteKm, distanceKm: gap }] : [];
  });
}

export function fuelPageState(source: Pick<ServicePoiSnapshot, "available">, route?: StoredServiceRoute): FuelPageState {
  if (!source.available) return "source-unavailable";
  return route ? "ready" : "no-route";
}

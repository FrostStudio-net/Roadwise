import { distance, length, lineString, nearestPointOnLine, point } from "@turf/turf";

import type { RouteWarning } from "@/types/analysis";
import type { Coordinates, GeoJsonLineString } from "@/types/road";

export const ROUTE_PROGRESS_CONFIG = {
  maximumRouteSnapDistanceMeters: 250,
  offRouteThresholdMeters: 100,
  gpsAccuracyThresholdMeters: 50,
  passedWarningToleranceKm: 0.1,
} as const;

export type RouteProgress = {
  status: "onRoute" | "offRoute" | "poorAccuracy";
  distanceTravelledKm?: number;
  distanceRemainingKm?: number;
  progressPercent?: number;
  distanceFromRouteMeters?: number;
  snappedCoordinates?: Coordinates;
};

export type UpcomingWarning = {
  warning: RouteWarning;
  distanceToWarningKm: number;
};

export function calculateRouteProgress(
  route: GeoJsonLineString,
  coordinates: Coordinates,
  accuracyMeters: number,
): RouteProgress {
  if (!Number.isFinite(accuracyMeters) || accuracyMeters > ROUTE_PROGRESS_CONFIG.gpsAccuracyThresholdMeters) {
    return { status: "poorAccuracy" };
  }
  const routeLine = lineString(route.coordinates);
  const currentPoint = point(coordinates);
  const snapped = nearestPointOnLine(routeLine, currentPoint, { units: "kilometers" });
  const distanceFromRouteMeters = distance(currentPoint, snapped, { units: "kilometers" }) * 1_000;
  const totalKm = length(routeLine, { units: "kilometers" });
  const travelledKm = Math.min(totalKm, Math.max(0, snapped.properties.location ?? 0));
  const status = distanceFromRouteMeters > ROUTE_PROGRESS_CONFIG.offRouteThresholdMeters
    || distanceFromRouteMeters > ROUTE_PROGRESS_CONFIG.maximumRouteSnapDistanceMeters
    ? "offRoute"
    : "onRoute";
  return {
    status,
    distanceTravelledKm: travelledKm,
    distanceRemainingKm: Math.max(0, totalKm - travelledKm),
    progressPercent: totalKm > 0 ? Math.min(100, Math.max(0, travelledKm / totalKm * 100)) : 0,
    distanceFromRouteMeters: Math.round(distanceFromRouteMeters),
    snappedCoordinates: snapped.geometry.coordinates as Coordinates,
  };
}

const severityPriority: Record<RouteWarning["severity"], number> = {
  closed: 0,
  difficult: 1,
  caution: 2,
  info: 3,
};

export function upcomingWarnings(warnings: RouteWarning[], routeProgressKm: number): UpcomingWarning[] {
  return warnings
    .flatMap((warning): UpcomingWarning[] => {
      if (warning.distanceAheadKm === undefined) return [];
      const distanceToWarningKm = warning.distanceAheadKm - routeProgressKm;
      return distanceToWarningKm < -ROUTE_PROGRESS_CONFIG.passedWarningToleranceKm
        ? []
        : [{ warning, distanceToWarningKm: Math.max(0, distanceToWarningKm) }];
    })
    .sort((a, b) => severityPriority[a.warning.severity] - severityPriority[b.warning.severity]
      || a.distanceToWarningKm - b.distanceToWarningKm);
}

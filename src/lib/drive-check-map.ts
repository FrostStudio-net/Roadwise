import along from "@turf/along";
import length from "@turf/length";
import { lineString } from "@turf/helpers";

import type { RouteWarning } from "@/types/analysis";
import type { Coordinates, GeoJsonLineString } from "@/types/road";

export type RouteWarningMarker = {
  warning: RouteWarning;
  coordinates: Coordinates;
};

export function routeWarningMarkers(route: GeoJsonLineString, warnings: RouteWarning[]): RouteWarningMarker[] {
  const routeLine = lineString(route.coordinates);
  const routeLengthKm = length(routeLine, { units: "kilometers" });

  return warnings.flatMap((warning): RouteWarningMarker[] => {
    if (warning.severity === "info") return [];
    if (warning.distanceAheadKm !== undefined && Number.isFinite(warning.distanceAheadKm)) {
      const routePositionKm = Math.max(0, Math.min(routeLengthKm, warning.distanceAheadKm));
      return [{ warning, coordinates: along(routeLine, routePositionKm, { units: "kilometers" }).geometry.coordinates as Coordinates }];
    }
    return warning.coordinates ? [{ warning, coordinates: warning.coordinates }] : [];
  });
}

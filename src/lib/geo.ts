import {
  booleanIntersects,
  buffer,
  lineString,
  multiLineString,
  nearestPointOnLine,
  point,
  pointToLineDistance,
  polygon,
} from "@turf/turf";

import type {
  GeoJsonLineString,
  ImoWarning,
  RoadCondition,
  RoadIncident,
  RoadsideMeasurement,
} from "@/types/road";

/** Conservative first-pass matching distances; calibrate with road-data experts. */
export const ROUTE_MATCHING_CONFIG = {
  incidentDistanceKm: 1,
  sectionDistanceKm: 0.75,
  weatherStationDistanceKm: 3,
  warningPolygonDistanceKm: 1,
} as const;

function routeFeature(route: GeoJsonLineString) {
  return lineString(route.coordinates);
}

function distanceAheadKm(route: GeoJsonLineString, coordinates: [number, number]): number {
  const snapped = nearestPointOnLine(routeFeature(route), point(coordinates), { units: "kilometers" });
  return Math.max(0, Math.round((snapped.properties.location ?? 0) * 10) / 10);
}

export function matchIncidentsToRoute(
  route: GeoJsonLineString,
  incidents: RoadIncident[],
  maximumDistanceKm = ROUTE_MATCHING_CONFIG.incidentDistanceKm,
): RoadIncident[] {
  const line = routeFeature(route);
  return incidents.flatMap((incident) => {
    if (!incident.coordinates) return [];
    const distance = pointToLineDistance(point(incident.coordinates), line, { units: "kilometers" });
    return distance <= maximumDistanceKm
      ? [{ ...incident, distanceAheadKm: distanceAheadKm(route, incident.coordinates) }]
      : [];
  });
}

export function matchRoadConditionsToRoute(
  route: GeoJsonLineString,
  conditions: RoadCondition[],
  maximumDistanceKm = ROUTE_MATCHING_CONFIG.sectionDistanceKm,
): RoadCondition[] {
  const routeArea = buffer(routeFeature(route), maximumDistanceKm, { units: "kilometers" });
  if (!routeArea) return [];
  return conditions.filter((condition) => {
    const geometry = condition.section?.geometry;
    if (!geometry) return false;
    const section = geometry.type === "LineString"
      ? lineString(geometry.coordinates)
      : multiLineString(geometry.coordinates);
    return booleanIntersects(routeArea, section);
  });
}

export function matchMeasurementsToRoute(
  route: GeoJsonLineString,
  measurements: RoadsideMeasurement[],
  maximumDistanceKm = ROUTE_MATCHING_CONFIG.weatherStationDistanceKm,
): RoadsideMeasurement[] {
  const line = routeFeature(route);
  return measurements.flatMap((measurement) => {
    const distance = pointToLineDistance(point(measurement.coordinates), line, { units: "kilometers" });
    return distance <= maximumDistanceKm
      ? [{ ...measurement, distanceAheadKm: distanceAheadKm(route, measurement.coordinates) }]
      : [];
  });
}

export function matchImoWarningsToRoute(
  route: GeoJsonLineString,
  warnings: ImoWarning[],
  maximumDistanceKm = ROUTE_MATCHING_CONFIG.warningPolygonDistanceKm,
): ImoWarning[] {
  const routeArea = buffer(routeFeature(route), maximumDistanceKm, { units: "kilometers" });
  if (!routeArea) return [];
  return warnings.filter((warning) => {
    if (warning.polygons.length === 0) {
      const area = warning.areaDescription?.toLowerCase() ?? "";
      return area.includes("iceland") || area.includes("allt landið");
    }
    return warning.polygons.some((geometry) => booleanIntersects(routeArea, polygon(geometry.coordinates)));
  });
}

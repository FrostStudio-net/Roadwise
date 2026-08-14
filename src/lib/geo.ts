import {
  along,
  booleanIntersects,
  buffer,
  length,
  lineString,
  multiLineString,
  nearestPointOnLine,
  point,
  pointToLineDistance,
  polygon,
  simplify,
} from "@turf/turf";

import type {
  Coordinates,
  GeoJsonLineString,
  ImoWarning,
  MatchedLinearGeometry,
  RoadCondition,
  RoadIncident,
  RoadsideMeasurement,
  RouteMatchEvidence,
} from "@/types/road";

/** Conservative first-pass spatial tolerances; calibrate with IRCA and road-safety experts. */
export const CRITICAL_ROUTE_MATCH_METERS = 20;
export const INCIDENT_MATCH_METERS = 75;
export const WEATHER_STATION_MATCH_METERS = 2_000;

export const ROUTE_MATCHING_CONFIG = {
  criticalRouteMatchMeters: CRITICAL_ROUTE_MATCH_METERS,
  criticalMinimumOverlapMeters: 150,
  roadConditionMatchMeters: 60,
  roadConditionMinimumOverlapMeters: 75,
  incidentMatchMeters: INCIDENT_MATCH_METERS,
  weatherStationMatchMeters: WEATHER_STATION_MATCH_METERS,
  warningPolygonDistanceMeters: 1_000,
  sampleIntervalMeters: 50,
} as const;

type LinearMatch = {
  distanceFromRouteMeters: number;
  distanceAheadKm: number;
  overlapLengthMeters: number;
};

function routeFeature(route: GeoJsonLineString) {
  return lineString(route.coordinates);
}

function matchingRouteFeature(route: GeoJsonLineString) {
  return simplify(routeFeature(route), { tolerance: 0.000025, highQuality: true });
}

function distanceAheadKm(route: GeoJsonLineString, coordinates: Coordinates): number {
  const snapped = nearestPointOnLine(routeFeature(route), point(coordinates), { units: "kilometers" });
  return Math.max(0, Math.round((snapped.properties.location ?? 0) * 10) / 10);
}

function geometryLines(geometry: MatchedLinearGeometry): Coordinates[][] {
  return geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
}

function lineMatch(route: GeoJsonLineString, coordinates: Coordinates[], proximityMeters: number): LinearMatch {
  const routeLine = matchingRouteFeature(route);
  const candidateLine = lineString(coordinates);
  const candidateLengthKm = length(candidateLine, { units: "kilometers" });
  const intervalKm = ROUTE_MATCHING_CONFIG.sampleIntervalMeters / 1_000;
  const sampleCount = Math.max(1, Math.ceil(candidateLengthKm / intervalKm));
  let minimumDistanceKm = Number.POSITIVE_INFINITY;
  let nearestCoordinate = coordinates[0];
  let currentNearMeters = 0;
  let maximumNearMeters = 0;

  for (let index = 0; index <= sampleCount; index += 1) {
    const locationKm = Math.min(candidateLengthKm, index * intervalKm);
    const sample = along(candidateLine, locationKm, { units: "kilometers" });
    const sampleCoordinates = sample.geometry.coordinates as Coordinates;
    const distanceKm = pointToLineDistance(sample, routeLine, { units: "kilometers" });
    if (distanceKm < minimumDistanceKm) {
      minimumDistanceKm = distanceKm;
      nearestCoordinate = sampleCoordinates;
    }
    if (distanceKm * 1_000 <= proximityMeters) {
      const segmentMeters = index === sampleCount
        ? Math.max(0, candidateLengthKm * 1_000 - (index - 1) * ROUTE_MATCHING_CONFIG.sampleIntervalMeters)
        : ROUTE_MATCHING_CONFIG.sampleIntervalMeters;
      currentNearMeters += segmentMeters;
      maximumNearMeters = Math.max(maximumNearMeters, currentNearMeters);
    } else {
      currentNearMeters = 0;
    }
  }

  if (booleanIntersects(routeLine, candidateLine)) minimumDistanceKm = 0;
  return {
    distanceFromRouteMeters: Math.round(minimumDistanceKm * 1_000),
    distanceAheadKm: distanceAheadKm(route, nearestCoordinate),
    overlapLengthMeters: Math.round(maximumNearMeters),
  };
}

function geometryMatch(route: GeoJsonLineString, geometry: MatchedLinearGeometry, proximityMeters: number): LinearMatch {
  return geometryLines(geometry)
    .map((coordinates) => lineMatch(route, coordinates, proximityMeters))
    .sort((a, b) => b.overlapLengthMeters - a.overlapLengthMeters
      || a.distanceFromRouteMeters - b.distanceFromRouteMeters)[0];
}

export function inspectGeometryRouteMatch(
  route: GeoJsonLineString,
  geometry: MatchedLinearGeometry,
  proximityMeters = ROUTE_MATCHING_CONFIG.criticalRouteMatchMeters,
): LinearMatch {
  return geometryMatch(route, geometry, proximityMeters);
}

function isCriticalCondition(condition: RoadCondition): boolean {
  return condition.state === "roadClosed" || condition.state === "closedPermanentlyForWinter";
}

export function matchIncidentsToRoute(
  route: GeoJsonLineString,
  incidents: RoadIncident[],
  maximumDistanceMeters = ROUTE_MATCHING_CONFIG.incidentMatchMeters,
): RoadIncident[] {
  const routeLine = routeFeature(route);
  const generalArea = buffer(matchingRouteFeature(route), maximumDistanceMeters / 1_000, { units: "kilometers" });
  const criticalArea = buffer(matchingRouteFeature(route), ROUTE_MATCHING_CONFIG.criticalRouteMatchMeters / 1_000, { units: "kilometers" });
  return incidents.flatMap((incident) => {
    if (incident.geometry) {
      const critical = incident.type === "roadClosed";
      const distanceLimit = critical ? ROUTE_MATCHING_CONFIG.criticalRouteMatchMeters : maximumDistanceMeters;
      const matchArea = critical ? criticalArea : generalArea;
      if (!matchArea || !booleanIntersects(matchArea, matchedGeometryFeature(incident.geometry))) return [];
      const metrics = geometryMatch(route, incident.geometry, distanceLimit);
      const criticalMatch = critical
        && metrics.distanceFromRouteMeters <= distanceLimit
        && metrics.overlapLengthMeters >= ROUTE_MATCHING_CONFIG.criticalMinimumOverlapMeters;
      const matches = critical ? criticalMatch : metrics.distanceFromRouteMeters <= distanceLimit;
      if (!matches) return [];
      const routeMatch: RouteMatchEvidence = {
        ...metrics,
        matchedGeometry: incident.geometry,
        criticalMatch,
      };
      return [{ ...incident, routeMatch, distanceAheadKm: metrics.distanceAheadKm }];
    }
    if (!incident.coordinates) return [];
    const distanceMeters = pointToLineDistance(point(incident.coordinates), routeLine, { units: "kilometers" }) * 1_000;
    if (distanceMeters > maximumDistanceMeters) return [];
    const ahead = distanceAheadKm(route, incident.coordinates);
    return [{
      ...incident,
      distanceAheadKm: ahead,
      routeMatch: {
        distanceFromRouteMeters: Math.round(distanceMeters),
        distanceAheadKm: ahead,
        // A point alone cannot prove that an official closure applies to the driven carriageway.
        criticalMatch: false,
      },
    }];
  });
}

export function matchRoadConditionsToRoute(route: GeoJsonLineString, conditions: RoadCondition[]): RoadCondition[] {
  const routeLine = matchingRouteFeature(route);
  const criticalArea = buffer(routeLine, ROUTE_MATCHING_CONFIG.criticalRouteMatchMeters / 1_000, { units: "kilometers" });
  const conditionArea = buffer(routeLine, ROUTE_MATCHING_CONFIG.roadConditionMatchMeters / 1_000, { units: "kilometers" });
  return conditions.flatMap((condition) => {
    const geometry = condition.section?.geometry;
    if (!geometry) return [];
    const critical = isCriticalCondition(condition);
    const proximityMeters = critical
      ? ROUTE_MATCHING_CONFIG.criticalRouteMatchMeters
      : ROUTE_MATCHING_CONFIG.roadConditionMatchMeters;
    const minimumOverlapMeters = critical
      ? ROUTE_MATCHING_CONFIG.criticalMinimumOverlapMeters
      : ROUTE_MATCHING_CONFIG.roadConditionMinimumOverlapMeters;
    const matchArea = critical ? criticalArea : conditionArea;
    if (!matchArea || !booleanIntersects(matchArea, matchedGeometryFeature(geometry))) return [];
    const metrics = geometryMatch(route, geometry, proximityMeters);
    if (metrics.distanceFromRouteMeters > proximityMeters || metrics.overlapLengthMeters < minimumOverlapMeters) return [];
    return [{
      ...condition,
      routeMatch: {
        ...metrics,
        matchedGeometry: geometry,
        criticalMatch: critical,
      },
    }];
  });
}

export function matchMeasurementsToRoute(
  route: GeoJsonLineString,
  measurements: RoadsideMeasurement[],
  maximumDistanceMeters = ROUTE_MATCHING_CONFIG.weatherStationMatchMeters,
): RoadsideMeasurement[] {
  const line = routeFeature(route);
  return measurements.flatMap((measurement) => {
    const distanceMeters = pointToLineDistance(point(measurement.coordinates), line, { units: "kilometers" }) * 1_000;
    if (distanceMeters > maximumDistanceMeters) return [];
    return [{
      ...measurement,
      distanceFromRouteMeters: Math.round(distanceMeters),
      distanceAheadKm: distanceAheadKm(route, measurement.coordinates),
    }];
  });
}

export function matchImoWarningsToRoute(
  route: GeoJsonLineString,
  warnings: ImoWarning[],
  maximumDistanceMeters = ROUTE_MATCHING_CONFIG.warningPolygonDistanceMeters,
): ImoWarning[] {
  const routeArea = buffer(routeFeature(route), maximumDistanceMeters / 1_000, { units: "kilometers" });
  if (!routeArea) return [];
  return warnings.filter((warning) => {
    if (warning.polygons.length === 0) {
      const area = warning.areaDescription?.toLowerCase() ?? "";
      return area.includes("iceland") || area.includes("allt landið");
    }
    return warning.polygons.some((geometry) => booleanIntersects(routeArea, polygon(geometry.coordinates)));
  });
}

// Retained for callers that need a Turf feature for diagnostics.
export function matchedGeometryFeature(geometry: MatchedLinearGeometry) {
  return geometry.type === "LineString"
    ? lineString(geometry.coordinates)
    : multiLineString(geometry.coordinates);
}

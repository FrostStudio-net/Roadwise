import along from "@turf/along";
import booleanIntersects from "@turf/boolean-intersects";
import buffer from "@turf/buffer";
import { lineString, multiLineString, point, polygon } from "@turf/helpers";
import length from "@turf/length";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import pointToLineDistance from "@turf/point-to-line-distance";
import simplify from "@turf/simplify";

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

type Bounds = [minLongitude: number, minLatitude: number, maxLongitude: number, maxLatitude: number];

function coordinateBounds(coordinates: Coordinates[]): Bounds {
  return coordinates.reduce<Bounds>(
    (result, coordinate) => [
      Math.min(result[0], coordinate[0]),
      Math.min(result[1], coordinate[1]),
      Math.max(result[2], coordinate[0]),
      Math.max(result[3], coordinate[1]),
    ],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  );
}

function expandedRouteBounds(route: GeoJsonLineString, distanceMeters: number): Bounds {
  const bounds = coordinateBounds(route.coordinates);
  const longitudePadding = distanceMeters / 40_000;
  const latitudePadding = distanceMeters / 110_000;
  return [
    bounds[0] - longitudePadding,
    bounds[1] - latitudePadding,
    bounds[2] + longitudePadding,
    bounds[3] + latitudePadding,
  ];
}

function boundsOverlap(left: Bounds, right: Bounds): boolean {
  return left[0] <= right[2] && left[2] >= right[0] && left[1] <= right[3] && left[3] >= right[1];
}

function geometryBounds(geometry: MatchedLinearGeometry): Bounds {
  return coordinateBounds(geometryLines(geometry).flat());
}

function routeFeature(route: GeoJsonLineString) {
  return lineString(route.coordinates);
}

function matchingRouteFeature(route: GeoJsonLineString) {
  return simplify(routeFeature(route), { tolerance: 0.000025, highQuality: true });
}

function distanceAheadKm(
  route: GeoJsonLineString,
  coordinates: Coordinates,
  fullRouteLine = routeFeature(route),
): number {
  const snapped = nearestPointOnLine(fullRouteLine, point(coordinates), { units: "kilometers" });
  return Math.max(0, Math.round((snapped.properties.location ?? 0) * 10) / 10);
}

function pointRouteMetrics(fullRouteLine: ReturnType<typeof routeFeature>, coordinates: Coordinates) {
  const snapped = nearestPointOnLine(fullRouteLine, point(coordinates), { units: "kilometers" });
  return {
    distanceMeters: Math.round((snapped.properties.dist
      ?? pointToLineDistance(point(coordinates), fullRouteLine, { units: "kilometers" })) * 1_000),
    distanceAheadKm: Math.max(0, Math.round((snapped.properties.location ?? 0) * 10) / 10),
  };
}

function geometryLines(geometry: MatchedLinearGeometry): Coordinates[][] {
  return geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
}

function lineMatch(
  route: GeoJsonLineString,
  coordinates: Coordinates[],
  proximityMeters: number,
  routeLine = matchingRouteFeature(route),
  fullRouteLine = routeFeature(route),
): LinearMatch {
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
    distanceAheadKm: distanceAheadKm(route, nearestCoordinate, fullRouteLine),
    overlapLengthMeters: Math.round(maximumNearMeters),
  };
}

function geometryMatch(
  route: GeoJsonLineString,
  geometry: MatchedLinearGeometry,
  proximityMeters: number,
  routeLine = matchingRouteFeature(route),
  fullRouteLine = routeFeature(route),
): LinearMatch {
  return geometryLines(geometry)
    .map((coordinates) => lineMatch(route, coordinates, proximityMeters, routeLine, fullRouteLine))
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
  const simplifiedRouteLine = matchingRouteFeature(route);
  const routeBounds = expandedRouteBounds(route, maximumDistanceMeters);
  const generalArea = buffer(simplifiedRouteLine, maximumDistanceMeters / 1_000, { units: "kilometers" });
  const criticalArea = buffer(simplifiedRouteLine, ROUTE_MATCHING_CONFIG.criticalRouteMatchMeters / 1_000, { units: "kilometers" });
  return incidents.flatMap((incident) => {
    if (incident.geometry) {
      const critical = incident.type === "roadClosed";
      const distanceLimit = critical ? ROUTE_MATCHING_CONFIG.criticalRouteMatchMeters : maximumDistanceMeters;
      const matchArea = critical ? criticalArea : generalArea;
      if (!boundsOverlap(routeBounds, geometryBounds(incident.geometry))) return [];
      if (!matchArea || !booleanIntersects(matchArea, matchedGeometryFeature(incident.geometry))) return [];
      const metrics = geometryMatch(route, incident.geometry, distanceLimit, simplifiedRouteLine, routeLine);
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
    if (!boundsOverlap(routeBounds, coordinateBounds([incident.coordinates]))) return [];
    const metrics = pointRouteMetrics(routeLine, incident.coordinates);
    if (metrics.distanceMeters > maximumDistanceMeters) return [];
    return [{
      ...incident,
      distanceAheadKm: metrics.distanceAheadKm,
      routeMatch: {
        distanceFromRouteMeters: metrics.distanceMeters,
        distanceAheadKm: metrics.distanceAheadKm,
        // A point alone cannot prove that an official closure applies to the driven carriageway.
        criticalMatch: false,
      },
    }];
  });
}

export function matchRoadConditionsToRoute(route: GeoJsonLineString, conditions: RoadCondition[]): RoadCondition[] {
  const routeLine = matchingRouteFeature(route);
  const fullRouteLine = routeFeature(route);
  const routeBounds = expandedRouteBounds(route, ROUTE_MATCHING_CONFIG.roadConditionMatchMeters);
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
    if (!boundsOverlap(routeBounds, geometryBounds(geometry))) return [];
    if (!matchArea || !booleanIntersects(matchArea, matchedGeometryFeature(geometry))) return [];
    const metrics = geometryMatch(route, geometry, proximityMeters, routeLine, fullRouteLine);
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
  const routeBounds = expandedRouteBounds(route, maximumDistanceMeters);
  return measurements.flatMap((measurement) => {
    if (!boundsOverlap(routeBounds, coordinateBounds([measurement.coordinates]))) return [];
    const metrics = pointRouteMetrics(line, measurement.coordinates);
    if (metrics.distanceMeters > maximumDistanceMeters) return [];
    return [{
      ...measurement,
      distanceFromRouteMeters: metrics.distanceMeters,
      distanceAheadKm: metrics.distanceAheadKm,
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

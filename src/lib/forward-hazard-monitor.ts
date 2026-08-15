import bearing from "@turf/bearing";
import destination from "@turf/destination";
import distance from "@turf/distance";
import { lineString, point } from "@turf/helpers";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import pointToLineDistance from "@turf/point-to-line-distance";

import {
  matchIncidentsToRoute,
  matchMeasurementsToRoute,
  matchRoadConditionsToRoute,
  ROUTE_MATCHING_CONFIG,
} from "@/lib/geo";
import { analyseRoute, RISK_THRESHOLDS } from "@/lib/risk-engine";
import type { RouteWarning, VehicleType } from "@/types/analysis";
import type {
  Coordinates,
  GeoJsonLineString,
  MatchedLinearGeometry,
  RoadCondition,
  RoadIncident,
  RoadsideMeasurement,
} from "@/types/road";

export const FORWARD_HAZARD_CONFIG = {
  forwardDistanceKm: {
    closure: 40,
    severe: 35,
    wind: 30,
    general: 25,
  },
  maximumHeadingDifferenceDegrees: 55,
  minimumReliableSpeedKmh: 5,
  gpsAccuracyThresholdMeters: 50,
  noHeading: {
    maximumHazardDistanceKm: 2,
    pointIncidentRadiusMeters: 500,
    windStationRadiusMeters: 1_000,
  },
  geometryIncidentMinimumOverlapMeters: 75,
  hazardStaleAfterMinutes: RISK_THRESHOLDS.freshness.warningStaleAfterMinutes,
} as const;

export type ForwardHazardMonitorInput = {
  coordinates: Coordinates;
  accuracyMeters: number;
  headingDegrees?: number;
  speedKmh?: number;
  vehicle: VehicleType;
  roadConditions: RoadCondition[];
  incidents: RoadIncident[];
  measurements: RoadsideMeasurement[];
  now?: number;
};

export type ForwardHazardMonitorResult = {
  status: "monitoring" | "poorAccuracy";
  headingReliable: boolean;
  directionContext: "ahead" | "nearby";
  warnings: RouteWarning[];
  matches: {
    roadConditions: number;
    incidents: number;
    roadsideStations: number;
  };
};

const severeTypes = new Set([
  "hazardous",
  "icyPatches",
  "snow",
  "snowfall",
  "badWeather",
  "blowingSnow",
  "blizzard",
  "flooding",
  "avalanches",
  "rockfalls",
  "accident",
]);

const closureTypes = new Set(["roadClosed", "closedPermanentlyForWinter"]);

export function monitorForwardHazards(input: ForwardHazardMonitorInput): ForwardHazardMonitorResult {
  if (!Number.isFinite(input.accuracyMeters)
    || input.accuracyMeters > FORWARD_HAZARD_CONFIG.gpsAccuracyThresholdMeters) {
    return emptyResult("poorAccuracy", false);
  }

  const now = input.now ?? Date.now();
  const headingReliable = isHeadingReliable(input.headingDegrees, input.speedKmh);
  const roadConditions = input.roadConditions.filter((condition) => isCurrent(condition, now));
  const incidents = input.incidents.filter((incident) => isCurrent(incident, now));
  const measurements = input.measurements.filter((measurement) => stationIsCurrent(measurement, now));

  const matches = headingReliable
    ? matchForwardCorridor(input.coordinates, input.headingDegrees as number, roadConditions, incidents, measurements)
    : matchNearbyFallback(input.coordinates, roadConditions, incidents, measurements);

  const analysis = analyseRoute({
    vehicle: input.vehicle,
    roadConditions: matches.roadConditions,
    incidents: matches.incidents,
    measurements: matches.measurements,
    imoWarnings: [],
  });

  return {
    status: "monitoring",
    headingReliable,
    directionContext: headingReliable ? "ahead" : "nearby",
    warnings: analysis.warnings.filter((warning) => !warning.stale),
    matches: {
      roadConditions: matches.roadConditions.length,
      incidents: matches.incidents.length,
      roadsideStations: matches.measurements.length,
    },
  };
}

function matchForwardCorridor(
  coordinates: Coordinates,
  headingDegrees: number,
  roadConditions: RoadCondition[],
  incidents: RoadIncident[],
  measurements: RoadsideMeasurement[],
) {
  const route = forwardRoute(coordinates, headingDegrees);
  return {
    roadConditions: matchRoadConditionsToRoute(route, roadConditions)
      .filter((condition) => forwardMatchIsPlausible(coordinates, headingDegrees, conditionCoordinate(condition, coordinates), condition.routeMatch?.distanceAheadKm, maximumDistanceFor(condition.state))),
    incidents: matchIncidentsToRoute(route, incidents)
      .filter((incident) => !incident.geometry
        || (incident.routeMatch?.overlapLengthMeters ?? 0) >= FORWARD_HAZARD_CONFIG.geometryIncidentMinimumOverlapMeters)
      .filter((incident) => forwardMatchIsPlausible(coordinates, headingDegrees, incidentCoordinate(incident, coordinates), incident.distanceAheadKm, maximumDistanceFor(incident.type))),
    measurements: matchMeasurementsToRoute(route, measurements)
      .filter((measurement) => forwardMatchIsPlausible(coordinates, headingDegrees, measurement.coordinates, measurement.distanceAheadKm, FORWARD_HAZARD_CONFIG.forwardDistanceKm.wind)),
  };
}

function matchNearbyFallback(
  coordinates: Coordinates,
  roadConditions: RoadCondition[],
  incidents: RoadIncident[],
  measurements: RoadsideMeasurement[],
) {
  const current = point(coordinates);
  const matchedConditions = roadConditions.flatMap((condition) => {
    const geometry = condition.section?.geometry;
    if (!geometry) return [];
    const metrics = distanceToGeometry(coordinates, geometry);
    const critical = closureTypes.has(condition.state);
    const maximumDistance = critical
      ? ROUTE_MATCHING_CONFIG.criticalRouteMatchMeters
      : ROUTE_MATCHING_CONFIG.roadConditionMatchMeters;
    if (metrics.distanceMeters > maximumDistance
      || metrics.directDistanceKm > FORWARD_HAZARD_CONFIG.noHeading.maximumHazardDistanceKm) return [];
    return [{
      ...condition,
      routeMatch: {
        distanceFromRouteMeters: metrics.distanceMeters,
        distanceAheadKm: metrics.directDistanceKm,
        matchedGeometry: geometry,
        criticalMatch: critical,
      },
    }];
  });

  const matchedIncidents = incidents.flatMap((incident) => {
    const metrics = incident.geometry
      ? distanceToGeometry(coordinates, incident.geometry)
      : incident.coordinates
        ? {
            coordinate: incident.coordinates,
            distanceMeters: Math.round(distance(current, point(incident.coordinates), { units: "kilometers" }) * 1_000),
            directDistanceKm: distance(current, point(incident.coordinates), { units: "kilometers" }),
          }
        : undefined;
    if (!metrics || metrics.directDistanceKm > FORWARD_HAZARD_CONFIG.noHeading.maximumHazardDistanceKm) return [];
    const maximumDistance = incident.geometry
      ? ROUTE_MATCHING_CONFIG.incidentMatchMeters
      : FORWARD_HAZARD_CONFIG.noHeading.pointIncidentRadiusMeters;
    if (metrics.distanceMeters > maximumDistance) return [];
    return [{
      ...incident,
      coordinates: incident.coordinates ?? metrics.coordinate,
      distanceAheadKm: roundDistance(metrics.directDistanceKm),
      routeMatch: {
        distanceFromRouteMeters: metrics.distanceMeters,
        distanceAheadKm: roundDistance(metrics.directDistanceKm),
        matchedGeometry: incident.geometry,
        // Without heading or a selected route, a closure cannot be authoritatively tied to the carriageway ahead.
        criticalMatch: false,
      },
    }];
  });

  const matchedMeasurements = measurements.flatMap((measurement) => {
    const directDistanceKm = distance(current, point(measurement.coordinates), { units: "kilometers" });
    if (directDistanceKm * 1_000 > FORWARD_HAZARD_CONFIG.noHeading.windStationRadiusMeters) return [];
    return [{
      ...measurement,
      distanceAheadKm: roundDistance(directDistanceKm),
      distanceFromRouteMeters: Math.round(directDistanceKm * 1_000),
    }];
  });

  return { roadConditions: matchedConditions, incidents: matchedIncidents, measurements: matchedMeasurements };
}

function forwardRoute(coordinates: Coordinates, headingDegrees: number): GeoJsonLineString {
  const end = destination(
    point(coordinates),
    FORWARD_HAZARD_CONFIG.forwardDistanceKm.closure,
    headingDegrees,
    { units: "kilometers" },
  ).geometry.coordinates as Coordinates;
  return { type: "LineString", coordinates: [coordinates, end] };
}

function forwardMatchIsPlausible(
  origin: Coordinates,
  headingDegrees: number,
  candidate: Coordinates | undefined,
  distanceAheadKm: number | undefined,
  maximumDistanceKm: number,
): boolean {
  if (!candidate || distanceAheadKm === undefined || distanceAheadKm > maximumDistanceKm) return false;
  const directDistanceKm = distance(point(origin), point(candidate), { units: "kilometers" });
  if (directDistanceKm <= 0.05) return true;
  const candidateBearing = bearing(point(origin), point(candidate));
  return headingDifference(headingDegrees, candidateBearing) <= FORWARD_HAZARD_CONFIG.maximumHeadingDifferenceDegrees;
}

function isHeadingReliable(headingDegrees?: number, speedKmh?: number): boolean {
  return headingDegrees !== undefined
    && Number.isFinite(headingDegrees)
    && headingDegrees >= 0
    && headingDegrees <= 360
    && (speedKmh === undefined || speedKmh >= FORWARD_HAZARD_CONFIG.minimumReliableSpeedKmh);
}

function headingDifference(left: number, right: number): number {
  const normalizedLeft = ((left % 360) + 360) % 360;
  const normalizedRight = ((right % 360) + 360) % 360;
  const difference = Math.abs(normalizedLeft - normalizedRight);
  return Math.min(difference, 360 - difference);
}

function maximumDistanceFor(type: string): number {
  if (closureTypes.has(type)) return FORWARD_HAZARD_CONFIG.forwardDistanceKm.closure;
  if (type === "strongWinds") return FORWARD_HAZARD_CONFIG.forwardDistanceKm.wind;
  if (severeTypes.has(type)) return FORWARD_HAZARD_CONFIG.forwardDistanceKm.severe;
  return FORWARD_HAZARD_CONFIG.forwardDistanceKm.general;
}

function conditionCoordinate(condition: RoadCondition, origin: Coordinates): Coordinates | undefined {
  const geometry = condition.section?.geometry;
  return geometry ? distanceToGeometry(origin, geometry).coordinate : undefined;
}

function incidentCoordinate(incident: RoadIncident, origin: Coordinates): Coordinates | undefined {
  if (incident.coordinates) return incident.coordinates;
  return incident.geometry ? distanceToGeometry(origin, incident.geometry).coordinate : undefined;
}

function distanceToGeometry(origin: Coordinates, geometry: MatchedLinearGeometry) {
  const current = point(origin);
  return (geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates)
    .map((coordinates) => {
      const line = lineString(coordinates);
      const nearest = nearestPointOnLine(line, current, { units: "kilometers" });
      const coordinate = nearest.geometry.coordinates as Coordinates;
      return {
        coordinate,
        distanceMeters: Math.round(pointToLineDistance(current, line, { units: "kilometers" }) * 1_000),
        directDistanceKm: distance(current, point(coordinate), { units: "kilometers" }),
      };
    })
    .sort((left, right) => left.distanceMeters - right.distanceMeters)[0];
}

function isCurrent(record: { updatedAt?: string; validFrom?: string; validTo?: string }, now: number): boolean {
  if (record.validFrom && validTimestamp(record.validFrom) && Date.parse(record.validFrom) > now) return false;
  if (record.validTo && validTimestamp(record.validTo) && Date.parse(record.validTo) < now) return false;
  if (!record.updatedAt || !validTimestamp(record.updatedAt)) return true;
  return now - Date.parse(record.updatedAt) <= FORWARD_HAZARD_CONFIG.hazardStaleAfterMinutes * 60_000;
}

function stationIsCurrent(measurement: RoadsideMeasurement, now: number): boolean {
  if (!measurement.observedAt || !validTimestamp(measurement.observedAt)) return true;
  return now - Date.parse(measurement.observedAt)
    <= RISK_THRESHOLDS.freshness.stationObservationMaxAgeMinutes * 60_000;
}

function validTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function roundDistance(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}

function emptyResult(status: "poorAccuracy", headingReliable: boolean): ForwardHazardMonitorResult {
  return {
    status,
    headingReliable,
    directionContext: "nearby",
    warnings: [],
    matches: { roadConditions: 0, incidents: 0, roadsideStations: 0 },
  };
}

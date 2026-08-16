import distance from "@turf/distance";
import { lineString, point } from "@turf/helpers";
import pointToLineDistance from "@turf/point-to-line-distance";

import { analyseRoute, RISK_THRESHOLDS } from "@/lib/risk-engine";
import type { RiskLevel, VehicleType } from "@/types/analysis";
import type { NearbyConditionsResponse } from "@/types/nearby";
import type { Coordinates, MatchedLinearGeometry, RoadCondition, RoadIncident, RoadsideMeasurement } from "@/types/road";

/**
 * Home-nearby matching is deliberately broader than route matching but still
 * geometry based. Road conditions and incidents must be within 20 km of the
 * current point; roadside wind uses only the nearest usable station within
 * 35 km. No missing road record is interpreted as a normal condition.
 */
export const NEARBY_CONDITIONS_CONFIG = {
  roadsAndAdvisoriesRadiusKm: 20,
  weatherMaximumDistanceKm: 35,
} as const;

type Availability = {
  roadConditions: boolean;
  sectionGeometry: boolean;
  incidents: boolean;
  measurements: boolean;
};

export function summarizeNearbyConditions(input: {
  coordinates: Coordinates;
  vehicle: VehicleType;
  roadConditions: RoadCondition[];
  incidents: RoadIncident[];
  measurements: RoadsideMeasurement[];
  availability: Availability;
  updatedAt?: string;
  now?: Date;
}): NearbyConditionsResponse {
  const now = input.now ?? new Date();
  return {
    generatedAt: now.toISOString(),
    radiusKm: {
      roadsAndAdvisories: NEARBY_CONDITIONS_CONFIG.roadsAndAdvisoriesRadiusKm,
      weather: NEARBY_CONDITIONS_CONFIG.weatherMaximumDistanceKm,
    },
    wind: getNearbyWindSummary(input.coordinates, input.vehicle, input.measurements, input.availability.measurements, now),
    roads: getNearbyRoadSummary(input.coordinates, input.vehicle, input.roadConditions, input.availability.roadConditions && input.availability.sectionGeometry, now),
    advisories: getNearbyAdvisorySummary(input.coordinates, input.vehicle, input.incidents, input.availability.incidents, now),
    source: {
      updatedAt: input.updatedAt,
      stale: isOlderThan(input.updatedAt, RISK_THRESHOLDS.freshness.roadDataStaleAfterMinutes, now),
    },
  };
}

export function getNearbyWindSummary(
  coordinates: Coordinates,
  vehicle: VehicleType,
  measurements: RoadsideMeasurement[],
  available: boolean,
  now = new Date(),
): NearbyConditionsResponse["wind"] {
  if (!available) return { available: false, status: "unknown" };
  const nearest = measurements
    .flatMap((measurement) => {
      const speed = measurement.values.maximumWindSpeedMps ?? measurement.values.windSpeedMps;
      if (speed === undefined || !Number.isFinite(speed) || speed < 0) return [];
      if (isOlderThan(measurement.observedAt, RISK_THRESHOLDS.freshness.stationObservationMaxAgeMinutes, now)) return [];
      return [{ measurement, speed, distanceKm: pointDistanceKm(coordinates, measurement.coordinates) }];
    })
    .filter((item) => item.distanceKm <= NEARBY_CONDITIONS_CONFIG.weatherMaximumDistanceKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
  if (!nearest) return { available: true, status: "unknown" };
  const analysis = analyseRoute({ vehicle, roadConditions: [], incidents: [], measurements: [nearest.measurement], imoWarnings: [] });
  return {
    available: true,
    status: analysis.level,
    speedMps: nearest.speed,
    stationName: nearest.measurement.name,
    distanceKm: roundDistance(nearest.distanceKm),
    observedAt: nearest.measurement.observedAt,
  };
}

export function getNearbyRoadSummary(
  coordinates: Coordinates,
  vehicle: VehicleType,
  conditions: RoadCondition[],
  available: boolean,
  now = new Date(),
): NearbyConditionsResponse["roads"] {
  if (!available) return { available: false, status: "unknown", matchedRecords: 0, attentionRecords: 0 };
  const nearby = mostSevereConditionPerSection(conditions.filter((condition) => isCurrent(condition, now)
    && condition.section?.geometry
    && distanceToGeometryKm(coordinates, condition.section.geometry) <= NEARBY_CONDITIONS_CONFIG.roadsAndAdvisoriesRadiusKm));
  if (!nearby.length) return { available: true, status: "unknown", matchedRecords: 0, attentionRecords: 0 };
  const analysis = analyseRoute({ vehicle, roadConditions: nearby, incidents: [], measurements: [], imoWarnings: [] });
  const onlyUnknown = nearby.every((condition) => condition.state === "unknown");
  return {
    available: true,
    status: onlyUnknown ? "unknown" : analysis.level,
    matchedRecords: nearby.length,
    attentionRecords: analysis.warnings.filter((warning) => warning.severity !== "info").length,
  };
}

export function getNearbyAdvisorySummary(
  coordinates: Coordinates,
  vehicle: VehicleType,
  incidents: RoadIncident[],
  available: boolean,
  now = new Date(),
): NearbyConditionsResponse["advisories"] {
  if (!available) return { available: false, status: "unknown", count: 0 };
  const nearby = incidents.filter((incident) => isCurrent(incident, now)
    && incidentDistanceKm(coordinates, incident) <= NEARBY_CONDITIONS_CONFIG.roadsAndAdvisoriesRadiusKm);
  if (!nearby.length) return { available: true, status: "normal", count: 0 };
  const analysis = analyseRoute({ vehicle, roadConditions: [], incidents: nearby, measurements: [], imoWarnings: [] });
  return { available: true, status: analysis.level, count: nearby.length };
}

function mostSevereConditionPerSection(conditions: RoadCondition[]): RoadCondition[] {
  const grouped = new Map<string, { condition: RoadCondition; rank: number }>();
  const rank: Record<RiskLevel, number> = { normal: 0, caution: 1, difficult: 2, closed: 3 };
  for (const condition of conditions) {
    const key = condition.section?.id ?? condition.locationId ?? condition.id;
    const previous = grouped.get(key);
    const level = analyseRoute({ vehicle: "Small car (2WD)", roadConditions: [condition], incidents: [], measurements: [], imoWarnings: [] }).level;
    if (!previous || rank[level] > previous.rank) grouped.set(key, { condition, rank: rank[level] });
  }
  return [...grouped.values()].map(({ condition }) => condition);
}

function incidentDistanceKm(coordinates: Coordinates, incident: RoadIncident): number {
  if (incident.coordinates) return pointDistanceKm(coordinates, incident.coordinates);
  return incident.geometry ? distanceToGeometryKm(coordinates, incident.geometry) : Number.POSITIVE_INFINITY;
}

function distanceToGeometryKm(coordinates: Coordinates, geometry: MatchedLinearGeometry): number {
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  const distances = lines
    .filter((line) => line.length >= 2)
    .map((line) => pointToLineDistance(point(coordinates), lineString(line), { units: "kilometers" }));
  return distances.length ? Math.min(...distances) : Number.POSITIVE_INFINITY;
}

function pointDistanceKm(left: Coordinates, right: Coordinates): number {
  return distance(point(left), point(right), { units: "kilometers" });
}

function isCurrent(record: Pick<RoadCondition | RoadIncident, "validFrom" | "validTo">, now: Date): boolean {
  const from = record.validFrom ? Date.parse(record.validFrom) : undefined;
  const to = record.validTo ? Date.parse(record.validTo) : undefined;
  return !(from !== undefined && !Number.isNaN(from) && from > now.getTime())
    && !(to !== undefined && !Number.isNaN(to) && to < now.getTime());
}

function isOlderThan(value: string | undefined, maximumMinutes: number, now: Date): boolean {
  if (!value || Number.isNaN(Date.parse(value))) return false;
  return now.getTime() - Date.parse(value) > maximumMinutes * 60_000;
}

function roundDistance(value: number): number {
  return Math.round(value * 10) / 10;
}

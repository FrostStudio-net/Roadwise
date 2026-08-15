import { lineString, point } from "@turf/helpers";
import pointToLineDistance from "@turf/point-to-line-distance";
import simplify from "@turf/simplify";

import { RISK_THRESHOLDS } from "@/lib/risk-engine";
import type { RoadMapFilter, RoadMapIncident, RoadMapObservation, RoadMapPayload, RoadMapSection, RoadMapStatus, RoadSectionDetails } from "@/types/road-map";
import type { Camera, Coordinates, MatchedLinearGeometry, RoadCondition, RoadConditionState, RoadIncident, RoadSection, RoadsideMeasurement } from "@/types/road";

export const ROAD_MAP_CONFIG = {
  geometryToleranceDegrees: 0.00015,
  incidentMatchMeters: 1_000,
  observationMatchKm: 25,
  cameraMatchKm: 10,
  recordStaleAfterMinutes: RISK_THRESHOLDS.freshness.warningStaleAfterMinutes,
  sourceStaleAfterMinutes: RISK_THRESHOLDS.freshness.roadDataStaleAfterMinutes,
} as const;

export const ROAD_MAP_DEFAULT_VIEW = {
  center: [-18.8, 64.85] as Coordinates,
  zoom: 4.65,
} as const;

const STATUS_RANK: Record<RoadMapStatus, number> = { unknown: 0, normal: 1, caution: 2, difficult: 3, closed: 4 };

export function normalizeRoadMapStatus(state: RoadConditionState): RoadMapStatus {
  if (state === "roadClosed" || state === "closedPermanentlyForWinter") return "closed";
  if (["hazardous", "blizzard", "snowfall", "badWeather", "blowingSnow"].includes(state)) return "difficult";
  if (["slippery", "icyPatches", "snow", "passableWithCare", "slushOnRoad", "looseChippings", "fog", "blowingDust"].includes(state)) return "caution";
  if (state === "normal") return "normal";
  return "unknown";
}

export function roadMapStatusLabel(status: RoadMapStatus): string {
  return {
    normal: "Normal conditions reported",
    caution: "Use caution",
    difficult: "Difficult conditions",
    closed: "Road closed",
    unknown: "Unknown",
  }[status];
}

export function simplifyRoadGeometry(geometry: MatchedLinearGeometry): MatchedLinearGeometry {
  if (geometry.type === "LineString") return { type: "LineString", coordinates: simplifyLine(geometry.coordinates) };
  return { type: "MultiLineString", coordinates: geometry.coordinates.map(simplifyLine).filter((line) => line.length >= 2) };
}

export function buildRoadMapPayload(input: {
  sections: RoadSection[];
  conditions: RoadCondition[];
  incidents: RoadIncident[];
  observations: RoadsideMeasurement[];
  cameras: Camera[];
  availability?: Partial<RoadMapPayload["sources"]>;
  updatedAt?: string;
  now?: Date;
}): RoadMapPayload {
  const now = input.now ?? new Date();
  const officialSections = new Map(input.sections.filter((section) => validGeometry(section.geometry)).map((section) => [section.id, section]));
  const grouped = new Map<string, RoadCondition[]>();
  for (const condition of input.conditions) {
    const sectionId = condition.locationId ?? condition.section?.id;
    if (!sectionId || !officialSections.has(sectionId) || !isCurrent(condition, now)) continue;
    grouped.set(sectionId, [...(grouped.get(sectionId) ?? []), condition]);
  }

  const sections = [...grouped.entries()].flatMap(([sectionId, conditions]): RoadMapSection[] => {
    const section = officialSections.get(sectionId);
    if (!section?.geometry) return [];
    const selected = [...conditions].sort((a, b) => STATUS_RANK[normalizeRoadMapStatus(b.state)] - STATUS_RANK[normalizeRoadMapStatus(a.state)])[0];
    return [{
      id: section.id,
      roadNumbers: section.roadNumbers,
      name: section.name,
      status: normalizeRoadMapStatus(selected.state),
      officialState: selected.state,
      comment: selected.description,
      updatedAt: selected.updatedAt,
      stale: isStale(selected.updatedAt, ROAD_MAP_CONFIG.recordStaleAfterMinutes, now),
      geometry: simplifyRoadGeometry(section.geometry),
    }];
  });

  return {
    generatedAt: now.toISOString(),
    updatedAt: input.updatedAt,
    sourceStale: isStale(input.updatedAt, ROAD_MAP_CONFIG.sourceStaleAfterMinutes, now),
    sources: {
      sections: input.availability?.sections ?? true,
      conditions: input.availability?.conditions ?? true,
      incidents: input.availability?.incidents ?? true,
      weather: input.availability?.weather ?? true,
      cameras: input.availability?.cameras ?? true,
    },
    sections,
    incidents: input.incidents.filter((incident) => isCurrent(incident, now)).flatMap((incident) => compactIncident(incident, now)),
    observations: input.observations.map(compactObservation),
    cameras: input.cameras.map(({ id, name, roadName, roadNumber, description, coordinates, imageUrl }) => ({ id, name, roadName, roadNumber, description, coordinates: roundCoordinate(coordinates), imageUrl })),
  };
}

export function sectionVisibleForFilter(section: RoadMapSection, filter: RoadMapFilter): boolean {
  if (filter === "all") return true;
  if (filter === "closures") return section.status === "closed";
  if (filter === "difficult") return section.status === "difficult" || section.status === "caution";
  return false;
}

export function matchRoadSectionDetails(section: RoadMapSection, payload: RoadMapPayload): RoadSectionDetails {
  const incidents = payload.incidents.filter((incident) => roadReferenceMatches(section, incident.roadNumber)
    || pointDistanceMeters(incident.coordinates, section.geometry) <= ROAD_MAP_CONFIG.incidentMatchMeters);
  const observations = payload.observations
    .map((observation) => ({ ...observation, distanceKm: pointDistanceMeters(observation.coordinates, section.geometry) / 1_000 }))
    .filter((observation) => observation.distanceKm <= ROAD_MAP_CONFIG.observationMatchKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const cameras = payload.cameras
    .map((camera) => ({ ...camera, distanceKm: pointDistanceMeters(camera.coordinates, section.geometry) / 1_000 }))
    .filter((camera) => roadReferenceMatches(section, camera.roadNumber) || camera.distanceKm <= ROAD_MAP_CONFIG.cameraMatchKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  return { incidents, observation: observations[0], cameras: cameras.slice(0, 3) };
}

function simplifyLine(coordinates: Coordinates[]): Coordinates[] {
  if (coordinates.length <= 2) return coordinates.map(roundCoordinate);
  const result = simplify(lineString(coordinates), { tolerance: ROAD_MAP_CONFIG.geometryToleranceDegrees, highQuality: true }).geometry.coordinates as Coordinates[];
  return (result.length >= 2 ? result : [coordinates[0], coordinates[coordinates.length - 1]]).map(roundCoordinate);
}

function compactIncident(incident: RoadIncident, now: Date): RoadMapIncident[] {
  const coordinates = incident.coordinates ?? firstCoordinate(incident.geometry);
  if (!coordinates) return [];
  return [{
    id: incident.id,
    type: incident.type,
    title: incident.title,
    description: incident.description,
    roadNumber: incident.roadNumber,
    roadName: incident.roadName,
    coordinates: roundCoordinate(coordinates),
    geometry: incident.geometry ? simplifyRoadGeometry(incident.geometry) : undefined,
    updatedAt: incident.updatedAt,
    stale: isStale(incident.updatedAt, ROAD_MAP_CONFIG.recordStaleAfterMinutes, now),
  }];
}

function compactObservation(observation: RoadsideMeasurement): RoadMapObservation {
  const { windSpeedMps, maximumWindSpeedMps, airTemperatureC, roadSurfaceTemperatureC } = observation.values;
  return { id: observation.id, name: observation.name, coordinates: roundCoordinate(observation.coordinates), observedAt: observation.observedAt, values: { windSpeedMps, maximumWindSpeedMps, airTemperatureC, roadSurfaceTemperatureC } };
}

function firstCoordinate(geometry?: MatchedLinearGeometry): Coordinates | undefined {
  return geometry?.type === "LineString" ? geometry.coordinates[0] : geometry?.coordinates[0]?.[0];
}

function roundCoordinate(coordinates: Coordinates): Coordinates {
  return [Number(coordinates[0].toFixed(5)), Number(coordinates[1].toFixed(5))];
}

function validGeometry(geometry?: MatchedLinearGeometry): geometry is MatchedLinearGeometry {
  return geometry?.type === "LineString" ? geometry.coordinates.length >= 2 : Boolean(geometry?.coordinates.some((line) => line.length >= 2));
}

function isCurrent(record: Pick<RoadCondition | RoadIncident, "validFrom" | "validTo">, now: Date): boolean {
  const from = record.validFrom ? Date.parse(record.validFrom) : undefined;
  const to = record.validTo ? Date.parse(record.validTo) : undefined;
  return !(from !== undefined && !Number.isNaN(from) && from > now.getTime())
    && !(to !== undefined && !Number.isNaN(to) && to < now.getTime());
}

function isStale(timestamp: string | undefined, minutes: number, now: Date): boolean {
  return Boolean(timestamp && !Number.isNaN(Date.parse(timestamp)) && now.getTime() - Date.parse(timestamp) > minutes * 60_000);
}

function roadReferenceMatches(section: RoadMapSection, roadNumber?: string): boolean {
  const wanted = normalizeRoadNumber(roadNumber);
  return Boolean(wanted && section.roadNumbers.some((value) => normalizeRoadNumber(value) === wanted));
}

function normalizeRoadNumber(value?: string): string | undefined {
  const normalized = value?.toUpperCase().replace(/\s+/g, "").trim();
  return normalized || undefined;
}

function pointDistanceMeters(coordinates: Coordinates, geometry: MatchedLinearGeometry): number {
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  const distances = lines.filter((line) => line.length >= 2).map((line) => pointToLineDistance(point(coordinates), lineString(line), { units: "meters" }));
  return distances.length ? Math.min(...distances) : Number.POSITIVE_INFINITY;
}

import { booleanIntersects, lineString, multiLineString, point, pointToLineDistance } from "@turf/turf";

import { RISK_THRESHOLDS } from "@/lib/risk-engine";
import type { VehicleType } from "@/types/analysis";
import type { FRoadEntry, FRoadSectionSummary, FRoadStatus, VehicleSuitability } from "@/types/f-road";
import type { Camera, Coordinates, MatchedLinearGeometry, RoadCondition, RoadConditionState, RoadIncident, RoadSection } from "@/types/road";

export const F_ROAD_CONFIG = {
  incidentGeometryMatchMeters: 100,
  cameraGeometryMatchMeters: 2_000,
  recordStaleAfterMinutes: RISK_THRESHOLDS.freshness.warningStaleAfterMinutes,
} as const;

// IRCA publishes Kjalvegur under current official route number 35, while many
// travellers still search for its established F35 name. Keep this narrow alias
// explicit so ordinary numbered roads are never inferred to be F-roads.
const OFFICIAL_NUMBER_ALIASES: Record<string, string> = { "35": "F35" };

type StatusDefinition = { status: FRoadStatus; label: string; rank: number };

const STATUS_BY_STATE: Record<RoadConditionState, StatusDefinition> = {
  normal: { status: "open", label: "Open / normal", rank: 1 },
  slippery: { status: "caution", label: "Use caution", rank: 2 },
  icyPatches: { status: "caution", label: "Use caution", rank: 2 },
  snow: { status: "caution", label: "Use caution", rank: 2 },
  passableWithCare: { status: "caution", label: "Use caution", rank: 2 },
  slushOnRoad: { status: "caution", label: "Use caution", rank: 2 },
  looseChippings: { status: "caution", label: "Use caution", rank: 2 },
  fog: { status: "caution", label: "Use caution", rank: 2 },
  blowingDust: { status: "caution", label: "Use caution", rank: 2 },
  hazardous: { status: "difficult", label: "Difficult", rank: 3 },
  blizzard: { status: "difficult", label: "Difficult", rank: 3 },
  snowfall: { status: "difficult", label: "Difficult", rank: 3 },
  badWeather: { status: "difficult", label: "Difficult", rank: 3 },
  blowingSnow: { status: "difficult", label: "Difficult", rank: 3 },
  roadClosed: { status: "closed", label: "Closed", rank: 4 },
  closedPermanentlyForWinter: { status: "closed", label: "Closed", rank: 4 },
  unknown: { status: "unknown", label: "Unknown", rank: 0 },
};

// This is guidance, not a statement of legal access. Vehicle drive systems,
// ground clearance and rental contracts vary within the broad Roadwise categories.
const SUITABILITY: Record<VehicleType, Omit<VehicleSuitability, "vehicle">> = {
  "Small car (2WD)": {
    level: "not-suitable",
    title: "Not suitable for a standard 2WD vehicle",
    detail: "F-roads generally require a suitable 4×4. Check your rental company’s restrictions.",
  },
  "SUV / 4x4": {
    level: "conditional",
    title: "4×4 vehicle required",
    detail: "Suitability still depends on the road, current conditions and your rental terms. Check your rental company’s restrictions.",
  },
  Campervan: {
    level: "unknown",
    title: "Vehicle suitability cannot be confirmed",
    detail: "Campervan capability and rental restrictions vary. Check your rental company before using an F-road.",
  },
  Motorhome: {
    level: "unknown",
    title: "Vehicle suitability cannot be confirmed",
    detail: "Motorhome capability and rental restrictions vary. Check your rental company before using an F-road.",
  },
  "Electric vehicle": {
    level: "unknown",
    title: "Vehicle suitability cannot be confirmed",
    detail: "The Roadwise EV category does not confirm 4×4 capability or clearance. Check the vehicle and rental restrictions.",
  },
};

export function normalizeFRoadQuery(value: string): string | undefined {
  const compact = value.trim().toUpperCase().replace(/\s+/g, "");
  const match = compact.match(/^F?(\d{1,4})$/);
  return match ? `F${Number(match[1])}` : undefined;
}

export function mapFRoadCondition(state: RoadConditionState): StatusDefinition {
  return STATUS_BY_STATE[state];
}

export function getVehicleSuitability(vehicle: VehicleType): VehicleSuitability {
  return { vehicle, ...SUITABILITY[vehicle] };
}

export function isFRoadSourceStale(updatedAt: string | undefined, now = new Date()): boolean {
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) return false;
  return now.getTime() - Date.parse(updatedAt) > RISK_THRESHOLDS.freshness.roadDataStaleAfterMinutes * 60_000;
}

export function findFRoad(entries: FRoadEntry[], query: string): FRoadEntry | undefined {
  const normalized = normalizeFRoadQuery(query);
  return normalized ? entries.find((entry) => entry.roadNumber === normalized) : undefined;
}

export function buildFRoadCatalog(input: {
  sections: RoadSection[];
  conditions: RoadCondition[];
  incidents: RoadIncident[];
  cameras: Camera[];
  now?: Date;
}): FRoadEntry[] {
  const now = input.now ?? new Date();
  const groups = new Map<string, RoadSection[]>();

  for (const section of input.sections) {
    for (const value of section.roadNumbers) {
      const roadNumber = normalizeOfficialFRoadNumber(value);
      if (!roadNumber) continue;
      groups.set(roadNumber, [...(groups.get(roadNumber) ?? []), section]);
    }
  }

  return [...groups.entries()]
    .map(([roadNumber, sections]) => {
      const summaries = sections.map((section) => summarizeSection(section, input.conditions, now));
      const incidents = input.incidents.filter((incident) => isCurrentRecord(incident, now) && matchesIncident(incident, roadNumber, sections));
      const cameras = input.cameras.filter((camera) => matchesCamera(camera, roadNumber, sections));
      return {
        roadNumber,
        name: mostCommonName(sections),
        sections: summaries,
        incidents: incidents.map(({ id, type, title, description, updatedAt }) => ({ id, type, title, description, updatedAt })),
        cameras,
      } satisfies FRoadEntry;
    })
    .sort((a, b) => Number(a.roadNumber.slice(1)) - Number(b.roadNumber.slice(1)));
}

function normalizeOfficialFRoadNumber(value: string): string | undefined {
  const compact = value.trim().toUpperCase().replace(/\s+/g, "");
  const match = compact.match(/^F(\d{1,4})$/);
  if (match) return `F${Number(match[1])}`;
  return OFFICIAL_NUMBER_ALIASES[String(Number(compact))];
}

function summarizeSection(section: RoadSection, conditions: RoadCondition[], now: Date): FRoadSectionSummary {
  const matching = conditions.filter((condition) => isCurrentRecord(condition, now) && (condition.locationId === section.id || condition.section?.id === section.id));
  const selected = matching.sort((a, b) => mapFRoadCondition(b.state).rank - mapFRoadCondition(a.state).rank)[0];
  const definition = selected ? mapFRoadCondition(selected.state) : STATUS_BY_STATE.unknown;
  return {
    id: section.id,
    name: section.name?.trim() || "Unnamed official section",
    status: definition.status,
    statusLabel: definition.label,
    officialState: selected?.state,
    description: selected?.description,
    updatedAt: selected?.updatedAt,
    stale: selected ? isStale(selected.updatedAt, now) : false,
  };
}

function isStale(updatedAt: string | undefined, now: Date): boolean {
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) return false;
  return now.getTime() - Date.parse(updatedAt) > F_ROAD_CONFIG.recordStaleAfterMinutes * 60_000;
}

function isCurrentRecord(record: Pick<RoadCondition | RoadIncident, "validFrom" | "validTo">, now: Date): boolean {
  const starts = record.validFrom ? Date.parse(record.validFrom) : undefined;
  const ends = record.validTo ? Date.parse(record.validTo) : undefined;
  if (starts !== undefined && !Number.isNaN(starts) && starts > now.getTime()) return false;
  if (ends !== undefined && !Number.isNaN(ends) && ends < now.getTime()) return false;
  return true;
}

function matchesIncident(incident: RoadIncident, roadNumber: string, sections: RoadSection[]): boolean {
  if (normalizeFRoadQuery(incident.roadNumber ?? "") === roadNumber) return true;
  if (containsRoadReference(`${incident.roadName ?? ""} ${incident.title}`, roadNumber)) return true;
  return sections.some((section) => section.geometry && incidentDistance(incident, section.geometry) <= F_ROAD_CONFIG.incidentGeometryMatchMeters);
}

function matchesCamera(camera: Camera, roadNumber: string, sections: RoadSection[]): boolean {
  if (normalizeFRoadQuery(camera.roadNumber ?? "") === roadNumber) return true;
  const metadataMatches = containsRoadReference(`${camera.roadName ?? ""} ${camera.name} ${camera.description ?? ""}`, roadNumber);
  if (!metadataMatches) return false;
  return sections.some((section) => section.geometry && pointDistanceToGeometry(camera.coordinates, section.geometry) <= F_ROAD_CONFIG.cameraGeometryMatchMeters);
}

function containsRoadReference(value: string, roadNumber: string): boolean {
  const digits = roadNumber.slice(1);
  return new RegExp(`(?:^|[^0-9])F?\\s*${digits}(?:[^0-9]|$)`, "i").test(value);
}

function incidentDistance(incident: RoadIncident, section: MatchedLinearGeometry): number {
  if (incident.coordinates) return pointDistanceToGeometry(incident.coordinates, section);
  if (!incident.geometry) return Number.POSITIVE_INFINITY;
  const incidentGeometry = incident.geometry;
  try {
    if (booleanIntersects(toFeature(incidentGeometry), toFeature(section))) return 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  const incidentPoints = flattenCoordinates(incidentGeometry);
  const sectionPoints = flattenCoordinates(section);
  return Math.min(
    ...incidentPoints.map((coordinate) => pointDistanceToGeometry(coordinate, section)),
    ...sectionPoints.map((coordinate) => pointDistanceToGeometry(coordinate, incidentGeometry)),
  );
}

function pointDistanceToGeometry(coordinates: Coordinates, geometry: MatchedLinearGeometry): number {
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  return Math.min(...lines.filter((line) => line.length >= 2).map((line) => pointToLineDistance(point(coordinates), lineString(line), { units: "meters" })));
}

function toFeature(geometry: MatchedLinearGeometry) {
  return geometry.type === "LineString" ? lineString(geometry.coordinates) : multiLineString(geometry.coordinates);
}

function flattenCoordinates(geometry: MatchedLinearGeometry): Coordinates[] {
  return geometry.type === "LineString" ? geometry.coordinates : geometry.coordinates.flat();
}

function mostCommonName(sections: RoadSection[]): string | undefined {
  const counts = new Map<string, number>();
  for (const section of sections) if (section.name?.trim()) counts.set(section.name.trim(), (counts.get(section.name.trim()) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

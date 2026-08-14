import type {
  RiskEngineInput,
  RiskLevel,
  RouteAnalysis,
  RouteWarning,
  VehicleType,
  WarningSeverity,
} from "@/types/analysis";
import type {
  Coordinates,
  IncidentType,
  RoadCondition,
  RoadConditionState,
  RoadIncident,
} from "@/types/road";

/**
 * Provisional product thresholds in metres/second. They are intentionally
 * centralized and are not claims of scientifically authoritative safe limits.
 * Calibrate with Icelandic road-safety and high-sided-vehicle experts.
 */
export const RISK_THRESHOLDS = {
  wind: {
    passenger: { cautionMps: 15, difficultMps: 22 },
    highProfile: { cautionMps: 10, difficultMps: 18 },
  },
  freshness: {
    warningStaleAfterMinutes: 180,
    stationObservationMaxAgeMinutes: 120,
    roadDataStaleAfterMinutes: 30,
  },
} as const;

const levelRank: Record<RiskLevel, number> = { normal: 0, caution: 1, difficult: 2, closed: 3 };
const severityRank: Record<WarningSeverity, number> = { info: 0, caution: 1, difficult: 2, closed: 3 };

const conditionDetails: Partial<Record<RoadConditionState, { title: string; severity: WarningSeverity }>> = {
  slippery: { title: "Slippery road", severity: "caution" },
  icyPatches: { title: "Icy patches", severity: "difficult" },
  snow: { title: "Snow on road", severity: "difficult" },
  hazardous: { title: "Hazardous road condition", severity: "difficult" },
  passableWithCare: { title: "Passable with care", severity: "caution" },
  slushOnRoad: { title: "Slush on road", severity: "caution" },
  roadClosed: { title: "Road closed", severity: "closed" },
  closedPermanentlyForWinter: { title: "Closed for winter", severity: "closed" },
  snowfall: { title: "Snowfall", severity: "difficult" },
  badWeather: { title: "Bad weather", severity: "difficult" },
  blowingDust: { title: "Blowing dust", severity: "caution" },
  blowingSnow: { title: "Blowing snow", severity: "difficult" },
  blizzard: { title: "Blizzard", severity: "difficult" },
  fog: { title: "Fog", severity: "caution" },
  looseChippings: { title: "Loose chippings", severity: "caution" },
};

const incidentDetails: Record<IncidentType, { title: string; severity: WarningSeverity }> = {
  roadClosed: { title: "Road closed", severity: "closed" },
  roadworks: { title: "Roadworks", severity: "caution" },
  roadSurfaceInPoorCondition: { title: "Poor road surface", severity: "caution" },
  looseChippings: { title: "Loose chippings", severity: "caution" },
  flooding: { title: "Flooding", severity: "difficult" },
  avalanches: { title: "Avalanche hazard", severity: "difficult" },
  rockfalls: { title: "Rockfall hazard", severity: "difficult" },
  animalsOnTheRoad: { title: "Animals on the road", severity: "caution" },
  strongWinds: { title: "Strong winds", severity: "difficult" },
  accident: { title: "Accident", severity: "difficult" },
  obstructionOnTheRoad: { title: "Obstruction on the road", severity: "caution" },
  unknown: { title: "Road incident", severity: "caution" },
};

function firstSectionCoordinate(condition: RoadCondition): Coordinates | undefined {
  const geometry = condition.section?.geometry;
  if (!geometry) return undefined;
  return geometry.type === "LineString" ? geometry.coordinates[0] : geometry.coordinates[0]?.[0];
}

function ageMinutes(value?: string): number | undefined {
  if (!value || Number.isNaN(Date.parse(value))) return undefined;
  return Math.max(0, (Date.now() - Date.parse(value)) / 60_000);
}

function warningIsStale(value?: string): boolean {
  const age = ageMinutes(value);
  return age !== undefined && age > RISK_THRESHOLDS.freshness.warningStaleAfterMinutes;
}

function conditionWarning(condition: RoadCondition): RouteWarning | undefined {
  const details = conditionDetails[condition.state];
  if (!details) return undefined;
  const location = condition.section?.name;
  return {
    id: `condition-${condition.id}`,
    type: condition.state,
    title: details.title,
    description: condition.description ?? (location ? `Official condition reported on ${location}.` : "Official road condition reported on this route."),
    severity: details.severity,
    source: "IRCA",
    sourceRecordId: condition.id,
    sourceType: condition.sourceType,
    roadNumber: condition.section?.roadNumbers.join(", ") || undefined,
    roadName: condition.section?.name,
    matchedSectionId: condition.section?.id,
    matchedGeometry: condition.routeMatch?.matchedGeometry,
    distanceFromRouteMeters: condition.routeMatch?.distanceFromRouteMeters,
    distanceAheadKm: condition.routeMatch?.distanceAheadKm,
    officialCondition: condition.state,
    officialComment: condition.description,
    coordinates: firstSectionCoordinate(condition),
    updatedAt: condition.updatedAt,
    stale: warningIsStale(condition.updatedAt),
  };
}

function incidentWarning(incident: RoadIncident): RouteWarning {
  const details = incidentDetails[incident.type];
  const unconfirmedPointClosure = incident.type === "roadClosed" && !incident.routeMatch?.criticalMatch;
  return {
    id: `incident-${incident.id}`,
    type: incident.type,
    title: unconfirmedPointClosure ? "Closure reported near route" : details.title,
    description: incident.description ?? "Official road incident reported close to this route.",
    severity: unconfirmedPointClosure ? "difficult" : details.severity,
    source: "IRCA",
    sourceRecordId: incident.id,
    sourceType: incident.sourceType,
    roadNumber: incident.roadNumber,
    roadName: incident.roadName,
    matchedGeometry: incident.routeMatch?.matchedGeometry,
    distanceFromRouteMeters: incident.routeMatch?.distanceFromRouteMeters,
    distanceAheadKm: incident.distanceAheadKm,
    officialCondition: incident.type,
    officialComment: incident.description,
    coordinates: incident.coordinates,
    updatedAt: incident.updatedAt,
    stale: warningIsStale(incident.updatedAt),
  };
}

function isHighProfileVehicle(vehicle: VehicleType): boolean {
  return vehicle === "Campervan" || vehicle === "Motorhome";
}

function windWarning(input: RiskEngineInput): RouteWarning | undefined {
  const thresholds = isHighProfileVehicle(input.vehicle)
    ? RISK_THRESHOLDS.wind.highProfile
    : RISK_THRESHOLDS.wind.passenger;
  const strongest = input.measurements
    .map((measurement) => ({
      measurement,
      speed: measurement.values.maximumWindSpeedMps ?? measurement.values.windSpeedMps,
    }))
    .filter((item): item is typeof item & { speed: number } => item.speed !== undefined)
    .filter(({ measurement }) => {
      const age = ageMinutes(measurement.observedAt);
      return age === undefined || age <= RISK_THRESHOLDS.freshness.stationObservationMaxAgeMinutes;
    })
    .sort((a, b) => b.speed - a.speed)[0];
  if (!strongest || strongest.speed < thresholds.cautionMps) return undefined;
  const severity: WarningSeverity = strongest.speed >= thresholds.difficultMps ? "difficult" : "caution";
  const vehicleNote = isHighProfileVehicle(input.vehicle) ? ` ${input.vehicle}s are more exposed to crosswinds.` : "";
  return {
    id: `wind-${strongest.measurement.id}`,
    type: "strongWinds",
    title: severity === "difficult" ? "Strong roadside wind" : "Elevated roadside wind",
    description: `IRCA measured ${strongest.speed.toFixed(1)} m/s at ${strongest.measurement.name}.${vehicleNote}`,
    severity,
    source: "Roadwise-derived",
    sourceRecordId: strongest.measurement.id,
    sourceType: "IRCA roadside measurement",
    roadName: strongest.measurement.name,
    distanceFromRouteMeters: strongest.measurement.distanceFromRouteMeters,
    distanceAheadKm: strongest.measurement.distanceAheadKm,
    coordinates: strongest.measurement.coordinates,
    observedAt: strongest.measurement.observedAt,
    stale: warningIsStale(strongest.measurement.observedAt),
  };
}

function imoSeverity(value?: string): WarningSeverity {
  const normalized = value?.toLowerCase();
  if (normalized === "extreme" || normalized === "severe") return "difficult";
  return "caution";
}

function warningLevel(warnings: RouteWarning[]): RiskLevel {
  return warnings.reduce<RiskLevel>((level, warning) => {
    const next = warning.severity === "info" ? "normal" : warning.severity;
    return levelRank[next] > levelRank[level] ? next : level;
  }, "normal");
}

function deduplicateWarnings(warnings: RouteWarning[]): RouteWarning[] {
  const seen = new Set<string>();
  return warnings
    .sort((a, b) => {
      const criticalDifference = Number(b.severity === "closed") - Number(a.severity === "closed");
      if (criticalDifference !== 0) return criticalDifference;
      const aDistance = a.distanceAheadKm ?? Number.POSITIVE_INFINITY;
      const bDistance = b.distanceAheadKm ?? Number.POSITIVE_INFINITY;
      if (aDistance !== bDistance) return aDistance - bDistance;
      return severityRank[b.severity] - severityRank[a.severity];
    })
    .filter((warning) => {
      const key = `${warning.source}:${warning.type}:${warning.title}:${warning.distanceAheadKm ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function analyseRoute(input: RiskEngineInput): RouteAnalysis {
  const derivedWindWarning = windWarning(input);
  const warnings = deduplicateWarnings([
    ...input.roadConditions.map(conditionWarning).filter((warning): warning is RouteWarning => Boolean(warning)),
    ...input.incidents.map(incidentWarning),
    ...input.imoWarnings.map((warning): RouteWarning => ({
      id: `imo-${warning.identifier}`,
      type: "meteorologicalWarning",
      title: warning.title,
      description: warning.description ?? warning.event ?? "Official meteorological warning affecting this route.",
      severity: imoSeverity(warning.severity),
      source: "IMO",
      sourceRecordId: warning.identifier,
      sourceType: warning.event,
      officialCondition: warning.severity,
      officialComment: warning.description,
      updatedAt: warning.sentAt,
      stale: warningIsStale(warning.sentAt),
    })),
    ...(derivedWindWarning ? [derivedWindWarning] : []),
  ]);

  // Explicit official closures are absolute and cannot be reduced by derived data.
  const officialClosure = warnings.some((warning) => warning.source === "IRCA" && warning.severity === "closed");
  const level = officialClosure ? "closed" : warningLevel(warnings);
  const triggeredByWarningIds = warnings
    .filter((warning) => (warning.severity === "info" ? "normal" : warning.severity) === level)
    .map((warning) => warning.id);
  const explainedWarnings = warnings.map((warning) => ({
    ...warning,
    affectsOverallLevel: triggeredByWarningIds.includes(warning.id),
  }));
  const safetyReminder = "Conditions can change quickly. Always follow official signs and instructions.";
  const copy: Record<RiskLevel, { title: string; summary: string }> = {
    normal: {
      title: "Normal conditions reported",
      summary: `No significant route hazards were reported by the available official sources. ${safetyReminder}`,
    },
    caution: {
      title: "Use caution",
      summary: `Official or measured conditions on this route deserve attention. ${safetyReminder}`,
    },
    difficult: {
      title: "Difficult conditions",
      summary: `Severe official or measured conditions affect this route. Reconsider the drive and consult official guidance. ${safetyReminder}`,
    },
    closed: {
      title: "Road closed / official severe condition",
      summary: `An official closure affects this route. Do not continue onto the closed section. ${safetyReminder}`,
    },
  };
  return { available: true, level, ...copy[level], warnings: explainedWarnings, triggeredByWarningIds };
}

import { VEHICLE_TYPES } from "@/types/analysis";
import type { AnalyseRouteResponse, GeocodedPlace, VehicleType } from "@/types/analysis";

export const ROUTE_ANALYSIS_STORAGE_KEY = "roadwise:last-route-analysis";
export const ROUTE_ANALYSIS_STORAGE_VERSION = 1;
export const ROUTE_ANALYSIS_TTL_MS = 6 * 60 * 60 * 1_000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredRouteAnalysis = {
  version: typeof ROUTE_ANALYSIS_STORAGE_VERSION;
  storedAt: number;
  analysis: AnalyseRouteResponse;
};

export function storeRouteAnalysis(analysis: AnalyseRouteResponse, now = Date.now(), storage = browserSessionStorage()): void {
  if (!storage) return;
  if (!isValidRouteAnalysis(analysis)) {
    try {
      storage.removeItem(ROUTE_ANALYSIS_STORAGE_KEY);
    } catch {
      // Drive Mode will still reject the invalid value when it is read.
    }
    return;
  }
  try {
    const compact: AnalyseRouteResponse = {
      ...analysis,
      analysis: {
        ...analysis.analysis,
        warnings: analysis.analysis.warnings.map((warning) => ({ ...warning, matchedGeometry: undefined })),
      },
      debug: undefined,
    };
    const value: StoredRouteAnalysis = { version: ROUTE_ANALYSIS_STORAGE_VERSION, storedAt: now, analysis: compact };
    storage.setItem(ROUTE_ANALYSIS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Drive Mode can still render its empty state when storage is disabled.
  }
}

export function readRouteAnalysis(now = Date.now(), storage = browserSessionStorage()): AnalyseRouteResponse | undefined {
  if (!storage) return undefined;
  try {
    const value = storage.getItem(ROUTE_ANALYSIS_STORAGE_KEY);
    const analysis = parseStoredRouteAnalysis(value, now);
    if (value && !analysis) storage.removeItem(ROUTE_ANALYSIS_STORAGE_KEY);
    return analysis;
  } catch {
    return undefined;
  }
}

export function clearRouteAnalysis(storage = browserSessionStorage()): void {
  try {
    storage?.removeItem(ROUTE_ANALYSIS_STORAGE_KEY);
  } catch {
    // No action required.
  }
}

export function parseStoredRouteAnalysis(value: string | null | undefined, now = Date.now()): AnalyseRouteResponse | undefined {
  if (!value) return undefined;
  try {
    const stored = JSON.parse(value) as Partial<StoredRouteAnalysis>;
    if (stored.version !== ROUTE_ANALYSIS_STORAGE_VERSION
      || !Number.isFinite(stored.storedAt)
      || (stored.storedAt as number) > now + 5 * 60_000
      || now - (stored.storedAt as number) > ROUTE_ANALYSIS_TTL_MS
      || !isValidRouteAnalysis(stored.analysis)) return undefined;
    return stored.analysis;
  } catch {
    return undefined;
  }
}

function isValidRouteAnalysis(value: unknown): value is AnalyseRouteResponse {
  if (!isRecord(value) || !VEHICLE_TYPES.includes(value.vehicle as VehicleType)) return false;
  const route = value.route;
  const analysis = value.analysis;
  if (!isRecord(route) || !validPlace(route.origin) || !validPlace(route.destination)) return false;
  if (!positiveNumber(route.distanceKm) || !positiveNumber(route.durationMinutes) || !validGeometry(route.geometry)) return false;
  if (!isRecord(analysis) || analysis.available !== true || !Array.isArray(analysis.warnings)) return false;
  return analysis.warnings.every((warning) => isRecord(warning)
    && nonEmptyString(warning.id)
    && nonEmptyString(warning.title)
    && nonEmptyString(warning.type));
}

function validPlace(value: unknown): value is GeocodedPlace {
  return isRecord(value) && nonEmptyString(value.name) && validCoordinate(value.coordinates);
}

function validGeometry(value: unknown): boolean {
  return isRecord(value)
    && value.type === "LineString"
    && Array.isArray(value.coordinates)
    && value.coordinates.length >= 2
    && value.coordinates.every(validCoordinate);
}

function validCoordinate(value: unknown): boolean {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && value[0] >= -180
    && value[0] <= 180
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
    && value[1] >= -90
    && value[1] <= 90;
}

function positiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function browserSessionStorage(): StorageLike | undefined {
  return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
}

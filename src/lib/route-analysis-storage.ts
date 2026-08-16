import { VEHICLE_TYPES } from "@/types/analysis";
import type { AnalyseRouteResponse, GeocodedPlace, VehicleType } from "@/types/analysis";

export const CHECKED_ROUTE_STORAGE_KEY = "roadwise:checked-route-analysis:v2";
export const ACTIVE_TRIP_STORAGE_KEY = "roadwise:active-trip:v1";
export const LEGACY_ROUTE_ANALYSIS_STORAGE_KEY = "roadwise:last-route-analysis";
export const ROUTE_STATE_STORAGE_VERSION = 2;
export const CHECKED_ROUTE_TTL_MS = 6 * 60 * 60 * 1_000;
export const ACTIVE_TRIP_TTL_MS = 12 * 60 * 60 * 1_000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredRouteState = {
  version: typeof ROUTE_STATE_STORAGE_VERSION;
  storedAt: number;
  analysis: AnalyseRouteResponse;
};

export function storeCheckedRoute(analysis: AnalyseRouteResponse, now = Date.now(), storage = browserSessionStorage()): boolean {
  return storeRouteState(CHECKED_ROUTE_STORAGE_KEY, analysis, now, storage);
}

export function readCheckedRoute(now = Date.now(), storage = browserSessionStorage()): AnalyseRouteResponse | undefined {
  return readRouteState(CHECKED_ROUTE_STORAGE_KEY, CHECKED_ROUTE_TTL_MS, now, storage);
}

export function clearCheckedRoute(storage = browserSessionStorage()): void {
  removeStorageKey(CHECKED_ROUTE_STORAGE_KEY, storage);
}

export function readActiveTrip(now = Date.now(), storage = browserSessionStorage()): AnalyseRouteResponse | undefined {
  return readRouteState(ACTIVE_TRIP_STORAGE_KEY, ACTIVE_TRIP_TTL_MS, now, storage);
}

export function clearActiveTrip(storage = browserSessionStorage()): void {
  removeStorageKey(ACTIVE_TRIP_STORAGE_KEY, storage);
}

export function promoteCheckedRouteToActiveTrip(expected: AnalyseRouteResponse, now = Date.now(), storage = browserSessionStorage()): AnalyseRouteResponse | undefined {
  const checked = readCheckedRoute(now, storage);
  if (!checked || !sameCheckedRoute(checked, expected)) return undefined;
  return storeRouteState(ACTIVE_TRIP_STORAGE_KEY, checked, now, storage) ? checked : undefined;
}

export function parseStoredRouteState(value: string | null | undefined, ttlMs: number, now = Date.now()): AnalyseRouteResponse | undefined {
  if (!value) return undefined;
  try {
    const stored = JSON.parse(value) as Partial<StoredRouteState>;
    if (stored.version !== ROUTE_STATE_STORAGE_VERSION
      || !Number.isFinite(stored.storedAt)
      || (stored.storedAt as number) > now + 5 * 60_000
      || now - (stored.storedAt as number) > ttlMs
      || !isValidRouteAnalysis(stored.analysis)) return undefined;
    return stored.analysis;
  } catch {
    return undefined;
  }
}

function storeRouteState(key: string, analysis: AnalyseRouteResponse, now: number, storage: StorageLike | undefined): boolean {
  if (!storage) return false;
  removeLegacyStorage(storage);
  if (!isValidRouteAnalysis(analysis)) return false;
  try {
    const value: StoredRouteState = { version: ROUTE_STATE_STORAGE_VERSION, storedAt: now, analysis: compactAnalysis(analysis) };
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readRouteState(key: string, ttlMs: number, now: number, storage: StorageLike | undefined): AnalyseRouteResponse | undefined {
  if (!storage) return undefined;
  try {
    removeLegacyStorage(storage);
    const value = storage.getItem(key);
    const analysis = parseStoredRouteState(value, ttlMs, now);
    if (value && !analysis) storage.removeItem(key);
    return analysis;
  } catch {
    return undefined;
  }
}

function compactAnalysis(analysis: AnalyseRouteResponse): AnalyseRouteResponse {
  return {
    ...analysis,
    analysis: {
      ...analysis.analysis,
      warnings: analysis.analysis.warnings.map((warning) => ({ ...warning, matchedGeometry: undefined })),
    },
    debug: undefined,
  };
}

function sameCheckedRoute(left: AnalyseRouteResponse, right: AnalyseRouteResponse): boolean {
  return left.vehicle === right.vehicle
    && left.route.destination.name === right.route.destination.name
    && coordinatesEqual(left.route.origin.coordinates, right.route.origin.coordinates)
    && coordinatesEqual(left.route.destination.coordinates, right.route.destination.coordinates)
    && Math.abs(left.route.distanceKm - right.route.distanceKm) < 0.01;
}

function coordinatesEqual(left: [number, number], right: [number, number]): boolean {
  return Math.abs(left[0] - right[0]) < 0.000001 && Math.abs(left[1] - right[1]) < 0.000001;
}

function removeLegacyStorage(storage: StorageLike): void {
  try {
    storage.removeItem(LEGACY_ROUTE_ANALYSIS_STORAGE_KEY);
  } catch {
    // The explicit v2 keys remain authoritative when storage is restricted.
  }
}

function removeStorageKey(key: string, storage: StorageLike | undefined): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Readers still reject invalid or inaccessible route state.
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

function validCoordinate(value: unknown): value is [number, number] {
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

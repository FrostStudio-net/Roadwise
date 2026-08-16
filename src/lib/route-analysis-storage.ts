import { VEHICLE_TYPES } from "@/types/analysis";
import type { AnalyseRouteResponse, GeocodedPlace, VehicleType } from "@/types/analysis";

export const CHECKED_ROUTE_STORAGE_KEY = "roadwise:checked-route-analysis:v2";
export const ACTIVE_TRIP_STORAGE_KEY = "roadwise.activeTrip.v2";
export const LEGACY_ACTIVE_TRIP_STORAGE_KEY = "roadwise:active-trip:v1";
export const LEGACY_ROUTE_ANALYSIS_STORAGE_KEY = "roadwise:last-route-analysis";
export const ROUTE_STATE_STORAGE_VERSION = 2;
export const CHECKED_ROUTE_TTL_MS = 6 * 60 * 60 * 1_000;
export const ACTIVE_TRIP_TTL_MS = 12 * 60 * 60 * 1_000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredCheckedRoute = {
  version: typeof ROUTE_STATE_STORAGE_VERSION;
  storedAt: number;
  analysis: AnalyseRouteResponse;
};

export type ActiveTripState = {
  version: typeof ROUTE_STATE_STORAGE_VERSION;
  startedAt: number;
  savedAt: number;
  analysisUpdatedAt: number;
  officialDataUpdatedAt?: string;
  analysis: AnalyseRouteResponse;
};

export function storeCheckedRoute(analysis: AnalyseRouteResponse, now = Date.now(), storage = browserSessionStorage()): boolean {
  if (!storage || !isValidRouteAnalysis(analysis)) return false;
  removeLegacyRouteStorage(storage);
  try {
    const value: StoredCheckedRoute = { version: ROUTE_STATE_STORAGE_VERSION, storedAt: now, analysis: compactAnalysis(analysis) };
    storage.setItem(CHECKED_ROUTE_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readCheckedRoute(now = Date.now(), storage = browserSessionStorage()): AnalyseRouteResponse | undefined {
  if (!storage) return undefined;
  try {
    removeLegacyRouteStorage(storage);
    const value = storage.getItem(CHECKED_ROUTE_STORAGE_KEY);
    const analysis = parseStoredCheckedRoute(value, now);
    if (value && !analysis) storage.removeItem(CHECKED_ROUTE_STORAGE_KEY);
    return analysis;
  } catch {
    return undefined;
  }
}

export function clearCheckedRoute(storage = browserSessionStorage()): void {
  removeStorageKey(CHECKED_ROUTE_STORAGE_KEY, storage);
}

export function readActiveTrip(now = Date.now(), storage = browserLocalStorage()): ActiveTripState | undefined {
  removeLegacyActiveStorage();
  if (!storage) return undefined;
  try {
    const value = storage.getItem(ACTIVE_TRIP_STORAGE_KEY);
    const activeTrip = parseActiveTripState(value, now);
    if (value && !activeTrip) storage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
    return activeTrip;
  } catch {
    return undefined;
  }
}

export function clearActiveTrip(storage = browserLocalStorage()): void {
  removeStorageKey(ACTIVE_TRIP_STORAGE_KEY, storage);
  removeLegacyActiveStorage();
}

export function promoteCheckedRouteToActiveTrip(
  expected: AnalyseRouteResponse,
  now = Date.now(),
  checkedStorage = browserSessionStorage(),
  activeStorage = browserLocalStorage(),
): ActiveTripState | undefined {
  const checked = readStoredCheckedRoute(now, checkedStorage);
  if (!activeStorage || !checked || !sameCheckedRoute(checked.analysis, expected)) return undefined;
  const activeTrip: ActiveTripState = {
    version: ROUTE_STATE_STORAGE_VERSION,
    startedAt: now,
    savedAt: now,
    analysisUpdatedAt: checked.storedAt,
    officialDataUpdatedAt: latestOfficialDataTimestamp(checked.analysis),
    analysis: compactAnalysis(checked.analysis),
  };
  return writeActiveTrip(activeTrip, activeStorage) ? activeTrip : undefined;
}

export function persistActiveTripRefresh(
  expected: ActiveTripState,
  refreshedAnalysis: AnalyseRouteResponse,
  now = Date.now(),
  storage = browserLocalStorage(),
): ActiveTripState | undefined {
  if (!storage || !isValidRouteAnalysis(refreshedAnalysis) || !sameCheckedRoute(expected.analysis, refreshedAnalysis)) return undefined;
  const current = readActiveTrip(now, storage);
  if (!current || current.startedAt !== expected.startedAt || !sameCheckedRoute(current.analysis, expected.analysis)) return undefined;
  const routePreservingRefresh: AnalyseRouteResponse = { ...refreshedAnalysis, route: current.analysis.route };
  const updated: ActiveTripState = {
    ...current,
    savedAt: now,
    analysisUpdatedAt: now,
    officialDataUpdatedAt: latestOfficialDataTimestamp(routePreservingRefresh),
    analysis: compactAnalysis(routePreservingRefresh),
  };
  return writeActiveTrip(updated, storage) ? updated : undefined;
}

export function parseStoredCheckedRoute(value: string | null | undefined, now = Date.now()): AnalyseRouteResponse | undefined {
  if (!value) return undefined;
  try {
    const stored = JSON.parse(value) as Partial<StoredCheckedRoute>;
    if (stored.version !== ROUTE_STATE_STORAGE_VERSION
      || !validStorageTime(stored.storedAt, now, CHECKED_ROUTE_TTL_MS)
      || !isValidRouteAnalysis(stored.analysis)) return undefined;
    return stored.analysis;
  } catch {
    return undefined;
  }
}

export function parseActiveTripState(value: string | null | undefined, now = Date.now()): ActiveTripState | undefined {
  if (!value) return undefined;
  try {
    const stored = JSON.parse(value) as Partial<ActiveTripState>;
    if (stored.version !== ROUTE_STATE_STORAGE_VERSION
      || !validStorageTime(stored.startedAt, now, ACTIVE_TRIP_TTL_MS)
      || !Number.isFinite(stored.savedAt)
      || (stored.savedAt as number) < (stored.startedAt as number)
      || (stored.savedAt as number) > now + 5 * 60_000
      || !Number.isFinite(stored.analysisUpdatedAt)
      || (stored.analysisUpdatedAt as number) > now + 5 * 60_000
      || now - (stored.analysisUpdatedAt as number) > ACTIVE_TRIP_TTL_MS
      || (stored.officialDataUpdatedAt !== undefined && Number.isNaN(Date.parse(stored.officialDataUpdatedAt)))
      || !isValidRouteAnalysis(stored.analysis)) return undefined;
    return stored as ActiveTripState;
  } catch {
    return undefined;
  }
}

function readStoredCheckedRoute(now: number, storage: StorageLike | undefined): StoredCheckedRoute | undefined {
  if (!storage) return undefined;
  try {
    const value = storage.getItem(CHECKED_ROUTE_STORAGE_KEY);
    if (!value) return undefined;
    const stored = JSON.parse(value) as Partial<StoredCheckedRoute>;
    if (stored.version !== ROUTE_STATE_STORAGE_VERSION
      || !validStorageTime(stored.storedAt, now, CHECKED_ROUTE_TTL_MS)
      || !isValidRouteAnalysis(stored.analysis)) return undefined;
    return stored as StoredCheckedRoute;
  } catch {
    return undefined;
  }
}

function writeActiveTrip(activeTrip: ActiveTripState, storage: StorageLike): boolean {
  try {
    storage.setItem(ACTIVE_TRIP_STORAGE_KEY, JSON.stringify(activeTrip));
    return true;
  } catch {
    return false;
  }
}

function validStorageTime(value: unknown, now: number, ttlMs: number): value is number {
  return Number.isFinite(value)
    && (value as number) <= now + 5 * 60_000
    && now - (value as number) <= ttlMs;
}

function compactAnalysis(analysis: AnalyseRouteResponse): AnalyseRouteResponse {
  return {
    ...analysis,
    analysis: {
      ...analysis.analysis,
      warnings: analysis.analysis.warnings.map((warning) => ({ ...warning, matchedGeometry: undefined })),
    },
    debug: undefined,
    timings: undefined,
  };
}

function latestOfficialDataTimestamp(analysis: AnalyseRouteResponse): string | undefined {
  return [analysis.sources.updatedAt, analysis.sources.roadDataUpdatedAt]
    .filter((value): value is string => Boolean(value) && !Number.isNaN(Date.parse(value as string)))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
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

function removeLegacyRouteStorage(storage: StorageLike): void {
  removeStorageKey(LEGACY_ROUTE_ANALYSIS_STORAGE_KEY, storage);
}

function removeLegacyActiveStorage(): void {
  for (const storage of [browserSessionStorage(), browserLocalStorage()]) {
    removeStorageKey(LEGACY_ACTIVE_TRIP_STORAGE_KEY, storage);
    removeStorageKey(LEGACY_ROUTE_ANALYSIS_STORAGE_KEY, storage);
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
  const sources = value.sources;
  const matches = value.matches;
  if (!isRecord(route) || !validPlace(route.origin) || !validPlace(route.destination)) return false;
  if (!positiveNumber(route.distanceKm) || !positiveNumber(route.durationMinutes) || !validGeometry(route.geometry)) return false;
  if (!isRecord(analysis)
    || analysis.available !== true
    || !["normal", "caution", "difficult", "closed"].includes(String(analysis.level))
    || !nonEmptyString(analysis.title)
    || !nonEmptyString(analysis.summary)
    || !Array.isArray(analysis.warnings)) return false;
  if (!isRecord(sources)
    || !isRecord(sources.mapbox)
    || !isRecord(sources.irca)
    || !isRecord(sources.imo)
    || !positiveNumber(sources.staleAfterMinutes)) return false;
  if (!isRecord(matches)
    || !nonNegativeNumber(matches.roadConditions)
    || !nonNegativeNumber(matches.incidents)
    || !nonNegativeNumber(matches.roadsideStations)
    || !nonNegativeNumber(matches.imoWarnings)) return false;
  return analysis.warnings.every((warning) => isRecord(warning)
    && nonEmptyString(warning.id)
    && nonEmptyString(warning.title)
    && nonEmptyString(warning.type)
    && nonEmptyString(warning.description)
    && ["info", "caution", "difficult", "closed"].includes(String(warning.severity))
    && ["IRCA", "IMO", "Roadwise-derived"].includes(String(warning.source))
    && (warning.distanceAheadKm === undefined || nonNegativeNumber(warning.distanceAheadKm)));
}

function validPlace(value: unknown): value is GeocodedPlace {
  return isRecord(value) && nonEmptyString(value.name) && validCoordinate(value.coordinates);
}

function validGeometry(value: unknown): boolean {
  return isRecord(value)
    && value.type === "LineString"
    && Array.isArray(value.coordinates)
    && value.coordinates.length >= 2
    && value.coordinates.length <= 20_000
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

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
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

function browserLocalStorage(): StorageLike | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

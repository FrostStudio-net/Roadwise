import { describe, expect, it } from "vitest";

import {
  ACTIVE_TRIP_STORAGE_KEY,
  ACTIVE_TRIP_TTL_MS,
  CHECKED_ROUTE_STORAGE_KEY,
  CHECKED_ROUTE_TTL_MS,
  clearActiveTrip,
  clearCheckedRoute,
  LEGACY_ROUTE_ANALYSIS_STORAGE_KEY,
  promoteCheckedRouteToActiveTrip,
  readActiveTrip,
  readCheckedRoute,
  storeCheckedRoute,
} from "@/lib/route-analysis-storage";
import type { AnalyseRouteResponse } from "@/types/analysis";

const now = Date.parse("2026-08-15T12:00:00Z");

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function routeAnalysis(destination = "Vík", destinationCoordinates: [number, number] = [-19.01, 63.42]): AnalyseRouteResponse {
  const place = (name: string, coordinates: [number, number]) => ({ name, fullName: `${name}, Iceland`, coordinates, featureType: "place", context: [] });
  return {
    vehicle: "Small car (2WD)",
    route: {
      origin: place("Reykjavík", [-21.94, 64.15]),
      destination: place(destination, destinationCoordinates),
      distanceKm: destination === "Akranes" ? 49 : 187,
      durationMinutes: destination === "Akranes" ? 45 : 150,
      geometry: { type: "LineString", coordinates: [[-21.94, 64.15], destinationCoordinates] },
    },
    analysis: { available: true, level: "normal", title: "Checked route", summary: "Current result", warnings: [], triggeredByWarningIds: [] },
    sources: {
      mapbox: { available: true, error: null },
      irca: { available: true, roadConditions: true, sectionGeometry: true, incidents: true, measurements: true, error: null },
      imo: { available: true, activeWarnings: 0, error: null },
      roadDataStale: false,
      staleAfterMinutes: 30,
    },
    matches: { roadConditions: 0, incidents: 0, roadsideStations: 0, imoWarnings: 0 },
  };
}

describe("checked-route and active-trip storage", () => {
  it("starts with neither route state", () => {
    const storage = new MemoryStorage();
    expect(readCheckedRoute(now, storage)).toBeUndefined();
    expect(readActiveTrip(now, storage)).toBeUndefined();
  });

  it("does not make a successfully checked route an active trip", () => {
    const storage = new MemoryStorage();
    storeCheckedRoute(routeAnalysis(), now, storage);
    expect(readCheckedRoute(now + 1_000, storage)?.route.destination.name).toBe("Vík");
    expect(readActiveTrip(now + 1_000, storage)).toBeUndefined();
  });

  it("promotes only the current matching checked route", () => {
    const storage = new MemoryStorage();
    const vik = routeAnalysis();
    storeCheckedRoute(vik, now, storage);
    expect(promoteCheckedRouteToActiveTrip(vik, now + 1_000, storage)?.route.destination.name).toBe("Vík");
    expect(readActiveTrip(now + 2_000, storage)?.route.destination.name).toBe("Vík");
  });

  it("preserves Vík as active while Akranes is only checked, then switches on explicit promotion", () => {
    const storage = new MemoryStorage();
    const vik = routeAnalysis();
    const akranes = routeAnalysis("Akranes", [-22.07, 64.32]);
    storeCheckedRoute(vik, now, storage);
    promoteCheckedRouteToActiveTrip(vik, now + 1_000, storage);
    storeCheckedRoute(akranes, now + 2_000, storage);
    expect(readCheckedRoute(now + 3_000, storage)?.route.destination.name).toBe("Akranes");
    expect(readActiveTrip(now + 3_000, storage)?.route.destination.name).toBe("Vík");
    expect(promoteCheckedRouteToActiveTrip(akranes, now + 4_000, storage)?.route.destination.name).toBe("Akranes");
    expect(readActiveTrip(now + 5_000, storage)?.route.destination.name).toBe("Akranes");
  });

  it("clears checked context and active trips independently", () => {
    const storage = new MemoryStorage();
    const vik = routeAnalysis();
    storeCheckedRoute(vik, now, storage);
    promoteCheckedRouteToActiveTrip(vik, now + 1_000, storage);
    clearCheckedRoute(storage);
    expect(readCheckedRoute(now + 2_000, storage)).toBeUndefined();
    expect(readActiveTrip(now + 2_000, storage)?.route.destination.name).toBe("Vík");
    storeCheckedRoute(vik, now + 3_000, storage);
    clearActiveTrip(storage);
    expect(readActiveTrip(now + 4_000, storage)).toBeUndefined();
    expect(readCheckedRoute(now + 4_000, storage)?.route.destination.name).toBe("Vík");
  });

  it("rejects expired checked state and removes it", () => {
    const storage = new MemoryStorage();
    storeCheckedRoute(routeAnalysis(), now, storage);
    expect(readCheckedRoute(now + CHECKED_ROUTE_TTL_MS + 1, storage)).toBeUndefined();
    expect(storage.getItem(CHECKED_ROUTE_STORAGE_KEY)).toBeNull();
  });

  it("does not restore an expired active trip", () => {
    const storage = new MemoryStorage();
    const vik = routeAnalysis();
    storeCheckedRoute(vik, now, storage);
    promoteCheckedRouteToActiveTrip(vik, now + 1_000, storage);
    expect(readActiveTrip(now + 1_000 + ACTIVE_TRIP_TTL_MS + 1, storage)).toBeUndefined();
    expect(storage.getItem(ACTIVE_TRIP_STORAGE_KEY)).toBeNull();
  });

  it("ignores and removes the legacy shared-route key", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_ROUTE_ANALYSIS_STORAGE_KEY, JSON.stringify({ version: 1, storedAt: now, analysis: routeAnalysis() }));
    expect(readCheckedRoute(now, storage)).toBeUndefined();
    expect(readActiveTrip(now, storage)).toBeUndefined();
    expect(storage.getItem(LEGACY_ROUTE_ANALYSIS_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(ACTIVE_TRIP_STORAGE_KEY)).toBeNull();
  });

  it("does not replace an active trip when promotion validation fails", () => {
    const storage = new MemoryStorage();
    const vik = routeAnalysis();
    storeCheckedRoute(vik, now, storage);
    promoteCheckedRouteToActiveTrip(vik, now + 1_000, storage);
    const akranes = routeAnalysis("Akranes", [-22.07, 64.32]);
    expect(promoteCheckedRouteToActiveTrip(akranes, now + 2_000, storage)).toBeUndefined();
    expect(readActiveTrip(now + 3_000, storage)?.route.destination.name).toBe("Vík");
  });
});

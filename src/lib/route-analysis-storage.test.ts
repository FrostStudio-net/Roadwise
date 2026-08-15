import { describe, expect, it } from "vitest";

import {
  readRouteAnalysis,
  ROUTE_ANALYSIS_STORAGE_KEY,
  ROUTE_ANALYSIS_TTL_MS,
  storeRouteAnalysis,
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

function routeAnalysis(): AnalyseRouteResponse {
  const place = (name: string, coordinates: [number, number]) => ({
    name,
    fullName: `${name}, Iceland`,
    coordinates,
    featureType: "place",
    context: [],
  });
  return {
    vehicle: "Small car (2WD)",
    route: {
      origin: place("Reykjavík", [-21.94, 64.15]),
      destination: place("Akureyri", [-18.09, 65.68]),
      distanceKm: 388,
      durationMinutes: 300,
      geometry: { type: "LineString", coordinates: [[-21.94, 64.15], [-18.09, 65.68]] },
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

describe("active checked-route storage", () => {
  it("returns no active route for fresh session storage", () => {
    expect(readRouteAnalysis(now, new MemoryStorage())).toBeUndefined();
  });

  it("restores a valid current route analysis", () => {
    const storage = new MemoryStorage();
    const analysis = routeAnalysis();
    storeRouteAnalysis(analysis, now, storage);
    expect(readRouteAnalysis(now + 60_000, storage)).toMatchObject({
      vehicle: analysis.vehicle,
      route: { destination: { name: "Akureyri" }, distanceKm: 388 },
    });
  });

  it("rejects and removes expired or invalid route data", () => {
    const expired = new MemoryStorage();
    storeRouteAnalysis(routeAnalysis(), now, expired);
    expect(readRouteAnalysis(now + ROUTE_ANALYSIS_TTL_MS + 1, expired)).toBeUndefined();
    expect(expired.getItem(ROUTE_ANALYSIS_STORAGE_KEY)).toBeNull();

    const invalid = new MemoryStorage();
    invalid.setItem(ROUTE_ANALYSIS_STORAGE_KEY, JSON.stringify({ version: 1, storedAt: now, analysis: { route: { destination: "not-a-route" } } }));
    expect(readRouteAnalysis(now, invalid)).toBeUndefined();
    expect(invalid.getItem(ROUTE_ANALYSIS_STORAGE_KEY)).toBeNull();
  });
});

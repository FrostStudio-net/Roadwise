import { describe, expect, it } from "vitest";

import { activeTripDataIsStale, officialTripDataAgeMinutes, savedTripAgeMinutes, savedTripClockTime } from "@/lib/offline-trip";
import type { ActiveTripState } from "@/lib/route-analysis-storage";
import type { AnalyseRouteResponse } from "@/types/analysis";

const now = Date.parse("2026-08-15T14:32:00Z");

function activeTrip(): ActiveTripState {
  const analysis = {
    vehicle: "Small car (2WD)",
    route: {
      origin: { name: "Reykjavík", fullName: "Reykjavík, Iceland", coordinates: [-21.94, 64.15], featureType: "place", context: [] },
      destination: { name: "Vík", fullName: "Vík, Iceland", coordinates: [-19.01, 63.42], featureType: "place", context: [] },
      distanceKm: 187,
      durationMinutes: 150,
      geometry: { type: "LineString", coordinates: [[-21.94, 64.15], [-19.01, 63.42]] },
    },
    analysis: { available: true, level: "normal", title: "Normal conditions reported", summary: "Current result", warnings: [], triggeredByWarningIds: [] },
    sources: {
      mapbox: { available: true, error: null },
      irca: { available: true, roadConditions: true, sectionGeometry: true, incidents: true, measurements: true, error: null },
      imo: { available: true, activeWarnings: 0, error: null },
      updatedAt: "2026-08-15T14:00:00Z",
      roadDataUpdatedAt: "2026-08-15T14:00:00Z",
      roadDataStale: false,
      staleAfterMinutes: 30,
    },
    matches: { roadConditions: 0, incidents: 0, roadsideStations: 0, imoWarnings: 0 },
  } satisfies AnalyseRouteResponse;
  return { version: 2, startedAt: now - 40 * 60_000, savedAt: now - 10 * 60_000, analysisUpdatedAt: now - 18 * 60_000, officialDataUpdatedAt: analysis.sources.updatedAt, analysis };
}

describe("offline active-trip freshness", () => {
  it("reports saved and official data ages independently", () => {
    const trip = activeTrip();
    expect(savedTripAgeMinutes(trip, now)).toBe(18);
    expect(officialTripDataAgeMinutes(trip, now)).toBe(32);
  });

  it("marks saved official conditions stale without removing the trip", () => {
    const trip = activeTrip();
    expect(activeTripDataIsStale(trip, now)).toBe(true);
    expect(trip.analysis.route.destination.name).toBe("Vík");
  });

  it("formats the persisted save time in Iceland time", () => {
    expect(savedTripClockTime(activeTrip())).toBe("14:14");
  });
});

import { describe, expect, it } from "vitest";

import { resolveHomeConditionCards } from "@/lib/home-condition-cards";
import type { AnalyseRouteResponse } from "@/types/analysis";
import type { NearbyConditionsResponse } from "@/types/nearby";

const nearby: NearbyConditionsResponse = {
  generatedAt: "2026-08-16T12:00:00.000Z",
  radiusKm: { roadsAndAdvisories: 20, weather: 35 },
  wind: { available: true, status: "normal", speedMps: 6, stationName: "Nearby station", distanceKm: 2 },
  roads: { available: true, status: "caution", matchedRecords: 2, attentionRecords: 2 },
  advisories: { available: true, status: "caution", count: 1 },
  source: { stale: false },
};

const route: AnalyseRouteResponse = {
  vehicle: "Small car (2WD)",
  route: {
    origin: { name: "Reykjavík", fullName: "Reykjavík, Iceland", coordinates: [-21.94, 64.15], featureType: "place", context: [] },
    destination: { name: "Selfoss", fullName: "Selfoss, Iceland", coordinates: [-20.99, 63.93], featureType: "place", context: [] },
    distanceKm: 52,
    durationMinutes: 45,
    geometry: { type: "LineString", coordinates: [[-21.94, 64.15], [-20.99, 63.93]] },
  },
  analysis: {
    available: true,
    level: "closed",
    title: "Road closed",
    summary: "An official closure affects this route.",
    warnings: [{ id: "incident-1", type: "roadClosed", title: "Road closed", description: "Official closure", severity: "closed", source: "IRCA" }],
    triggeredByWarningIds: ["incident-1"],
  },
  sources: {
    mapbox: { available: true, error: null },
    irca: { available: true, roadConditions: true, sectionGeometry: true, incidents: true, measurements: true, error: null },
    imo: { available: true, activeWarnings: 0, error: null },
    roadDataStale: false,
    staleAfterMinutes: 30,
  },
  matches: { roadConditions: 1, incidents: 1, roadsideStations: 1, imoWarnings: 0 },
};

describe("Home condition-card precedence", () => {
  it("uses a successful stored route before nearby summaries", () => {
    const cards = resolveHomeConditionCards({ route, routeContext: "checked", nearby, locationStatus: "available", nearbyLoading: false });
    expect(cards.roads).toMatchObject({ value: "Road closed", note: "On your route", tone: "closed" });
    expect(cards.advisories).toMatchObject({ value: "1 reported", note: "On your route", tone: "closed" });
  });

  it("labels an active trip distinctly from a merely checked route", () => {
    const cards = resolveHomeConditionCards({ route, routeContext: "active", nearby, locationStatus: "available", nearbyLoading: false });
    expect(cards.wind.note).toBe("On active route");
    expect(cards.roads.note).toBe("On active route");
    expect(cards.advisories.note).toBe("On active route");
  });

  it("returns to nearby summaries when the active route is cleared", () => {
    const cards = resolveHomeConditionCards({ nearby, locationStatus: "available", nearbyLoading: false });
    expect(cards.wind).toMatchObject({ value: "6 m/s", note: "Nearby", tone: "good" });
    expect(cards.roads).toMatchObject({ value: "2 cautions nearby", note: "Nearby", tone: "caution" });
    expect(cards.advisories).toMatchObject({ value: "1 nearby", note: "Nearby" });
  });

  it("does not present a source failure as zero nearby advisories", () => {
    const cards = resolveHomeConditionCards({ locationStatus: "available", nearbyLoading: false, nearbyUnavailable: true });
    expect(cards.advisories.value).toBe("Unavailable");
    expect(cards.advisories.tone).toBe("neutral");
  });
});

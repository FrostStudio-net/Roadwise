import { describe, expect, it } from "vitest";

import { getNearbyAdvisorySummary, getNearbyRoadSummary, getNearbyWindSummary, NEARBY_CONDITIONS_CONFIG } from "@/lib/nearby-conditions";
import type { RoadCondition, RoadIncident, RoadsideMeasurement } from "@/types/road";

const NOW = new Date();
const USER = [-21.94, 64.15] as const;

function condition(id: string, state: RoadCondition["state"], longitudeOffset: number): RoadCondition {
  return {
    id,
    state,
    updatedAt: NOW.toISOString(),
    section: {
      id: `section-${id}`,
      name: `Section ${id}`,
      roadNumbers: ["1"],
      geometry: { type: "LineString", coordinates: [[USER[0] + longitudeOffset, USER[1] - 0.02], [USER[0] + longitudeOffset, USER[1] + 0.02]] },
    },
  };
}

function measurement(speed: number, longitudeOffset = 0.02, observedAt = NOW.toISOString()): RoadsideMeasurement {
  return { id: "wind", name: "Nearby station", coordinates: [USER[0] + longitudeOffset, USER[1]], measurementTypes: ["wind"], observedAt, values: { windSpeedMps: speed } };
}

describe("nearby Home conditions", () => {
  it("uses one documented radius and preserves a nearby official closure", () => {
    expect(NEARBY_CONDITIONS_CONFIG.roadsAndAdvisoriesRadiusKm).toBe(20);
    const summary = getNearbyRoadSummary([...USER], "Small car (2WD)", [condition("closed", "roadClosed", 0.02)], true, NOW);
    expect(summary.status).toBe("closed");
    expect(summary.matchedRecords).toBe(1);
  });

  it("excludes unrelated road geometry outside the nearby corridor", () => {
    const summary = getNearbyRoadSummary([...USER], "Small car (2WD)", [condition("far", "hazardous", 0.8)], true, NOW);
    expect(summary.status).toBe("unknown");
    expect(summary.matchedRecords).toBe(0);
  });

  it("does not turn a missing official condition record into normal", () => {
    expect(getNearbyRoadSummary([...USER], "Small car (2WD)", [], true, NOW)).toMatchObject({ status: "unknown", matchedRecords: 0 });
  });

  it("uses the existing vehicle-aware wind thresholds", () => {
    const observations = [measurement(12)];
    expect(getNearbyWindSummary([...USER], "Small car (2WD)", observations, true, NOW).status).toBe("normal");
    expect(getNearbyWindSummary([...USER], "Campervan", observations, true, NOW).status).toBe("caution");
  });

  it("rejects stale or too-distant wind readings", () => {
    const stale = measurement(18, 0.02, new Date(NOW.getTime() - 4 * 60 * 60_000).toISOString());
    const far = measurement(18, 0.8);
    expect(getNearbyWindSummary([...USER], "Campervan", [stale, far], true, NOW).speedMps).toBeUndefined();
  });

  it("distinguishes no advisories from an unavailable advisory source", () => {
    expect(getNearbyAdvisorySummary([...USER], "Small car (2WD)", [], true, NOW)).toMatchObject({ available: true, count: 0, status: "normal" });
    expect(getNearbyAdvisorySummary([...USER], "Small car (2WD)", [], false, NOW)).toMatchObject({ available: false, count: 0, status: "unknown" });
  });

  it("includes only current nearby official incidents", () => {
    const incidents: RoadIncident[] = [
      { id: "near", type: "roadworks", title: "Roadworks", coordinates: [USER[0] + 0.02, USER[1]], validTo: new Date(NOW.getTime() + 60 * 60_000).toISOString() },
      { id: "far", type: "roadworks", title: "Far works", coordinates: [USER[0] + 0.8, USER[1]] },
      { id: "expired", type: "accident", title: "Expired", coordinates: [...USER], validTo: new Date(NOW.getTime() - 60 * 60_000).toISOString() },
    ];
    expect(getNearbyAdvisorySummary([...USER], "Small car (2WD)", incidents, true, NOW)).toMatchObject({ count: 1, status: "caution" });
  });
});

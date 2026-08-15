import { afterEach, describe, expect, it, vi } from "vitest";

import { monitorForwardHazards } from "@/lib/forward-hazard-monitor";
import type { VehicleType } from "@/types/analysis";
import type { RoadCondition, RoadIncident, RoadsideMeasurement } from "@/types/road";

const now = Date.parse("2026-08-15T12:00:00.000Z");

afterEach(() => vi.useRealTimers());

function condition(id: string, state: RoadCondition["state"], coordinates: [number, number][]): RoadCondition {
  return {
    id,
    state,
    section: {
      id: `section-${id}`,
      name: `Road ${id}`,
      roadNumbers: ["1"],
      geometry: { type: "LineString", coordinates },
    },
  };
}

function incident(id: string, coordinates: [number, number], type: RoadIncident["type"] = "roadworks"): RoadIncident {
  return { id, type, title: type === "roadworks" ? "Roadworks" : type, coordinates };
}

function monitor({
  headingDegrees = 90,
  accuracyMeters = 8,
  speedKmh = 60,
  vehicle = "Small car (2WD)",
  roadConditions = [],
  incidents = [],
  measurements = [],
}: {
  headingDegrees?: number;
  accuracyMeters?: number;
  speedKmh?: number;
  vehicle?: VehicleType;
  roadConditions?: RoadCondition[];
  incidents?: RoadIncident[];
  measurements?: RoadsideMeasurement[];
} = {}) {
  return monitorForwardHazards({
    coordinates: [0, 0],
    headingDegrees,
    accuracyMeters,
    speedKmh,
    vehicle,
    roadConditions,
    incidents,
    measurements,
    now,
  });
}

describe("forward hazard monitor", () => {
  it("includes a hazard directly ahead", () => {
    const result = monitor({
      roadConditions: [condition("closure", "roadClosed", [[0.004, 0], [0.03, 0]])],
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ type: "roadClosed", severity: "closed" });
  });

  it("excludes a hazard behind the driver", () => {
    const result = monitor({ incidents: [incident("behind", [-0.01, 0])] });
    expect(result.warnings).toEqual([]);
  });

  it("excludes a hazard on a nearby parallel road when geometry supports it", () => {
    const result = monitor({
      roadConditions: [condition("parallel", "slippery", [[0.004, 0.001], [0.03, 0.001]])],
    });
    expect(result.warnings).toEqual([]);
  });

  it("includes a point hazard inside the forward corridor", () => {
    const result = monitor({ incidents: [incident("corridor", [0.01, 0.0002])] });
    expect(result.warnings[0]).toMatchObject({ type: "roadworks", sourceRecordId: "corridor" });
  });

  it("excludes a point hazard too far laterally", () => {
    const result = monitor({ incidents: [incident("lateral", [0.01, 0.002])] });
    expect(result.warnings).toEqual([]);
  });

  it("uses a smaller nearby fallback when heading is unavailable", () => {
    const result = monitor({
      headingDegrees: Number.NaN,
      speedKmh: 0,
      roadConditions: [condition("nearby", "passableWithCare", [[-0.005, 0], [0.01, 0]])],
    });
    expect(result.directionContext).toBe("nearby");
    expect(result.headingReliable).toBe(false);
    expect(result.warnings[0]?.type).toBe("passableWithCare");
  });

  it("waits when GPS accuracy is poor", () => {
    const result = monitor({
      accuracyMeters: 90,
      incidents: [incident("ahead", [0.01, 0])],
    });
    expect(result.status).toBe("poorAccuracy");
    expect(result.warnings).toEqual([]);
  });

  it("reuses vehicle-aware wind escalation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const station: RoadsideMeasurement = {
      id: "wind",
      name: "Road 1 station",
      coordinates: [0.01, 0],
      measurementTypes: ["maximumWindSpeed"],
      observedAt: "2026-08-15T11:55:00.000Z",
      values: { maximumWindSpeedMps: 12 },
    };
    expect(monitor({ vehicle: "Small car (2WD)", measurements: [station] }).warnings).toEqual([]);
    expect(monitor({ vehicle: "Motorhome", measurements: [station] }).warnings[0]).toMatchObject({
      type: "strongWinds",
      severity: "caution",
    });
  });

  it("excludes stale hazards", () => {
    const stale = condition("stale", "slippery", [[0.004, 0], [0.03, 0]]);
    stale.updatedAt = "2026-08-15T08:59:00.000Z";
    expect(monitor({ roadConditions: [stale] }).warnings).toEqual([]);
  });
});

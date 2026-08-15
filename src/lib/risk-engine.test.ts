import { describe, expect, it } from "vitest";

import { analyseRoute } from "@/lib/risk-engine";
import type { RiskEngineInput, VehicleType } from "@/types/analysis";
import type { RoadsideMeasurement } from "@/types/road";

function input(vehicle: VehicleType, measurements: RoadsideMeasurement[] = []): RiskEngineInput {
  return {
    vehicle,
    roadConditions: [],
    incidents: [],
    measurements,
    imoWarnings: [],
  };
}

describe("risk engine", () => {
  it("returns normal when no relevant hazards are present", () => {
    const analysis = analyseRoute(input("Small car (2WD)"));
    expect(analysis.level).toBe("normal");
    expect(analysis.title).toBe("Normal conditions reported");
    expect(analysis.triggeredByWarningIds).toEqual([]);
  });

  it("escalates strong gusts sooner for a motorhome than a passenger car", () => {
    const station: RoadsideMeasurement = {
      id: "wind-station",
      name: "Route station",
      coordinates: [0.01, 0],
      measurementTypes: ["maximumWindSpeed"],
      distanceFromRouteMeters: 5,
      distanceAheadKm: 1.1,
      values: { maximumWindSpeedMps: 12 },
    };
    expect(analyseRoute(input("Small car (2WD)", [station])).level).toBe("normal");
    expect(analyseRoute(input("Motorhome", [station])).level).toBe("caution");
  });

  it("sorts an affecting closure first, then non-critical warnings by driving distance", () => {
    const analysis = analyseRoute({
      ...input("Small car (2WD)"),
      roadConditions: [{
        id: "closure",
        state: "roadClosed",
        section: { id: "closed-section", roadNumbers: ["1"] },
        routeMatch: { distanceFromRouteMeters: 2, distanceAheadKm: 20, criticalMatch: true },
      }],
      incidents: [{
        id: "works",
        type: "roadworks",
        title: "Roadworks",
        distanceAheadKm: 2,
        routeMatch: { distanceFromRouteMeters: 3, distanceAheadKm: 2, criticalMatch: false },
      }],
    });
    expect(analysis.warnings.map((warning) => warning.sourceRecordId)).toEqual(["closure", "works"]);
    expect(analysis.triggeredByWarningIds).toEqual(["condition-closure"]);
    expect(analysis.title).toBe("Road closed");
  });
});

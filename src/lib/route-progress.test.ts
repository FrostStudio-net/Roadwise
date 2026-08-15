import { describe, expect, it } from "vitest";

import { calculateRouteProgress, upcomingWarnings } from "@/lib/route-progress";
import type { RouteWarning } from "@/types/analysis";
import type { GeoJsonLineString } from "@/types/road";

const route: GeoJsonLineString = { type: "LineString", coordinates: [[0, 0], [0.1, 0]] };

function warning(id: string, distanceAheadKm: number): RouteWarning {
  return { id, type: "roadworks", title: "Roadworks", description: "Roadworks", severity: "caution", source: "IRCA", distanceAheadKm };
}

describe("route progress", () => {
  it("calculates a point at route start", () => {
    const result = calculateRouteProgress(route, [0, 0], 5);
    expect(result.status).toBe("onRoute");
    expect(result.distanceTravelledKm).toBeCloseTo(0, 2);
    expect(result.progressPercent).toBeCloseTo(0, 1);
  });

  it("calculates a point halfway along the route", () => {
    const result = calculateRouteProgress(route, [0.05, 0], 5);
    expect(result.progressPercent).toBeCloseTo(50, 0);
    expect(result.distanceRemainingKm).toBeCloseTo(result.distanceTravelledKm ?? 0, 1);
  });

  it("calculates a point at route end", () => {
    const result = calculateRouteProgress(route, [0.1, 0], 5);
    expect(result.progressPercent).toBeCloseTo(100, 1);
    expect(result.distanceRemainingKm).toBeCloseTo(0, 2);
  });

  it("keeps a warning ahead and updates its relative distance", () => {
    expect(upcomingWarnings([warning("ahead", 8)], 5)[0].distanceToWarningKm).toBe(3);
  });

  it("removes a warning that has already been passed", () => {
    expect(upcomingWarnings([warning("passed", 3)], 5)).toEqual([]);
  });

  it("accepts a GPS point slightly beside the route", () => {
    const result = calculateRouteProgress(route, [0.05, 0.0002], 10);
    expect(result.status).toBe("onRoute");
    expect(result.distanceFromRouteMeters).toBeLessThan(30);
  });

  it("marks a GPS point clearly off route", () => {
    expect(calculateRouteProgress(route, [0.05, 0.003], 10).status).toBe("offRoute");
  });

  it("does not report precise progress when GPS accuracy is poor", () => {
    const result = calculateRouteProgress(route, [0.05, 0], 100);
    expect(result.status).toBe("poorAccuracy");
    expect(result.distanceTravelledKm).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";

import { routeWarningMarkers } from "@/lib/drive-check-map";
import type { RouteWarning } from "@/types/analysis";
import type { GeoJsonLineString } from "@/types/road";

const route: GeoJsonLineString = { type: "LineString", coordinates: [[-22, 64], [-20, 64]] };

function warning(overrides: Partial<RouteWarning>): RouteWarning {
  return { id: "warning", type: "roadworks", title: "Roadworks", description: "Official roadworks record", severity: "caution", source: "IRCA", ...overrides };
}

describe("Drive Check route warning markers", () => {
  it("projects a final warning's existing route position onto the analyzed geometry", () => {
    const markers = routeWarningMarkers(route, [warning({ distanceAheadKm: 30, coordinates: [-18, 65] })]);
    expect(markers).toHaveLength(1);
    expect(markers[0].coordinates[0]).toBeGreaterThan(-22);
    expect(markers[0].coordinates[0]).toBeLessThan(-20);
    expect(markers[0].coordinates[1]).toBeCloseTo(64, 1);
  });

  it("uses an existing warning coordinate when no route position is available", () => {
    expect(routeWarningMarkers(route, [warning({ coordinates: [-21.5, 64.02] })])[0].coordinates).toEqual([-21.5, 64.02]);
  });

  it("does not invent markers for normal information or unpositioned warnings", () => {
    expect(routeWarningMarkers(route, [warning({ severity: "info", coordinates: [-21.5, 64] }), warning({ id: "unpositioned" })])).toEqual([]);
  });
});

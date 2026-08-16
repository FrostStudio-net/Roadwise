import { describe, expect, it } from "vitest";

import { createChargingOutlook } from "@/lib/charging-outlook";
import type { GeoJsonLineString } from "@/types/road";
import type { ServicePoi } from "@/types/service-poi";

const route: GeoJsonLineString = { type: "LineString", coordinates: [[-22, 64], [-20, 64]] };

function poi(id: string, type: ServicePoi["type"], coordinates: [number, number]): ServicePoi {
  return { id, type, name: id, coordinates, connectors: [], fuelTypes: [], source: "OpenStreetMap" };
}

describe("Drive Check charging outlook", () => {
  it("counts only EV chargers inside the existing route corridor", () => {
    const result = createChargingOutlook(route, 180, [
      poi("charger-a", "ev", [-21.8, 64.01]),
      poi("charger-b", "ev", [-20.8, 64.01]),
      poi("off-route", "ev", [-21, 64.3]),
      poi("fuel", "fuel", [-21.4, 64.01]),
    ]);
    expect(result.chargerCount).toBe(2);
  });

  it("reports the longest configured Roadwise-listed charger gap without making a charging plan", () => {
    const result = createChargingOutlook(route, 220, [poi("charger", "ev", [-21, 64.01])]);
    expect(result.longestGapKm).toBeGreaterThanOrEqual(80);
  });
});

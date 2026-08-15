import { describe, expect, it } from "vitest";

import { detectLongServiceGaps, filterServicePois, fuelPageState, matchServicePoisToRoute, nearestServicePois } from "@/lib/fuel-services";
import type { GeoJsonLineString } from "@/types/road";
import type { RouteServicePoi, ServicePoi } from "@/types/service-poi";

const route: GeoJsonLineString = {
  type: "LineString",
  coordinates: [[-21.95, 64.15], [-20.95, 64.15], [-19.95, 64.15]],
};

function poi(id: string, type: ServicePoi["type"], coordinates: [number, number]): ServicePoi {
  return { id, type, name: id, coordinates, connectors: [], fuelTypes: [], source: "OpenStreetMap" };
}

describe("nearby fuel and EV services", () => {
  it("sorts the nearest POI first", () => {
    const result = nearestServicePois([-21.95, 64.15], [
      poi("far", "fuel", [-20.95, 64.15]),
      poi("near", "fuel", [-21.94, 64.15]),
    ], "fuel");
    expect(result.map(({ id }) => id)).toEqual(["near", "far"]);
  });

  it("filters fuel and EV records independently", () => {
    const data = [poi("fuel", "fuel", [-21.9, 64.15]), poi("ev", "ev", [-21.8, 64.15])];
    expect(filterServicePois(data, "fuel").map(({ id }) => id)).toEqual(["fuel"]);
    expect(filterServicePois(data, "ev").map(({ id }) => id)).toEqual(["ev"]);
    expect(filterServicePois(data, "all")).toHaveLength(2);
  });
});

describe("along-route services", () => {
  it("includes POIs inside the route corridor and excludes distant POIs", () => {
    const result = matchServicePoisToRoute({ route, filter: "all", corridorKm: 5, pois: [
      poi("near-route", "fuel", [-21.4, 64.16]),
      poi("far-side-road", "fuel", [-21.4, 64.3]),
    ] });
    expect(result.map(({ id }) => id)).toEqual(["near-route"]);
    expect(result[0].lateralDistanceKm).toBeLessThan(5);
  });

  it("sorts matched POIs in driving order", () => {
    const result = matchServicePoisToRoute({ route, filter: "fuel", pois: [
      poi("later", "fuel", [-20.2, 64.15]),
      poi("first", "fuel", [-21.7, 64.15]),
    ] });
    expect(result.map(({ id }) => id)).toEqual(["first", "later"]);
    expect(result[0].distanceAheadKm).toBeLessThan(result[1].distanceAheadKm);
  });

  it("excludes POIs that have already been passed", () => {
    const all = matchServicePoisToRoute({ route, filter: "fuel", pois: [
      poi("behind", "fuel", [-21.7, 64.15]),
      poi("ahead", "fuel", [-20.2, 64.15]),
    ] });
    const result = matchServicePoisToRoute({ route, filter: "fuel", pois: all, currentRouteKm: all[1].routePositionKm - 5 });
    expect(result.map(({ id }) => id)).toEqual(["ahead"]);
  });
});

describe("long service gaps", () => {
  it("detects configurable gaps between listed services", () => {
    const matched = [
      { ...poi("one", "fuel", [-21.7, 64.15]), routePositionKm: 20, distanceAheadKm: 20, lateralDistanceKm: 0 },
      { ...poi("two", "fuel", [-20.2, 64.15]), routePositionKm: 140, distanceAheadKm: 140, lateralDistanceKm: 0 },
    ] satisfies RouteServicePoi[];
    const gaps = detectLongServiceGaps({ routeDistanceKm: 180, matchedPois: matched, type: "fuel", thresholdKm: 100 });
    expect(gaps).toEqual([{ fromRouteKm: 20, toRouteKm: 140, distanceKm: 120 }]);
  });
});

describe("fuel page failure states", () => {
  it("reports the no-route state", () => {
    expect(fuelPageState({ available: true })).toBe("no-route");
  });

  it("reports a missing source before route availability", () => {
    expect(fuelPageState({ available: false }, { geometry: route, distanceKm: 100 })).toBe("source-unavailable");
  });
});

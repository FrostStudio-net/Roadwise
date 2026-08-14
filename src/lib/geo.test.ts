import { describe, expect, it } from "vitest";

import { matchIncidentsToRoute, matchMeasurementsToRoute, matchRoadConditionsToRoute } from "@/lib/geo";
import { analyseRoute } from "@/lib/risk-engine";
import type { RiskEngineInput } from "@/types/analysis";
import type { GeoJsonLineString, RoadCondition, RoadsideMeasurement } from "@/types/road";

const route: GeoJsonLineString = {
  type: "LineString",
  coordinates: [[0, 0], [0.02, 0]],
};

function condition(state: RoadCondition["state"], coordinates: [number, number][], roadNumber = "1"): RoadCondition {
  return {
    id: `${state}-${roadNumber}`,
    state,
    description: state,
    section: {
      id: `section-${roadNumber}`,
      name: `Road ${roadNumber}`,
      roadNumbers: [roadNumber],
      geometry: { type: "LineString", coordinates },
    },
  };
}

function input(roadConditions: RoadCondition[]): RiskEngineInput {
  return {
    vehicle: "Small car (2WD)",
    roadConditions,
    incidents: [],
    measurements: [],
    imoWarnings: [],
  };
}

describe("critical route matching", () => {
  it("classifies a closure that co-travels directly with the selected route as closed", () => {
    const matched = matchRoadConditionsToRoute(route, [condition("roadClosed", [[0.004, 0], [0.016, 0]])]);
    expect(matched).toHaveLength(1);
    expect(matched[0].routeMatch?.criticalMatch).toBe(true);
    expect(analyseRoute(input(matched)).level).toBe("closed");
  });

  it("does not match a closure on a crossing side road", () => {
    const sideRoad = condition("roadClosed", [[0.01, -0.004], [0.01, 0.004]], "42");
    expect(matchRoadConditionsToRoute(route, [sideRoad])).toEqual([]);
  });

  it("does not match a closed F-road running near the main route", () => {
    const fRoad = condition("roadClosed", [[0.004, 0.0003], [0.016, 0.0003]], "F35");
    expect(matchRoadConditionsToRoute(route, [fRoad])).toEqual([]);
  });

  it("does not make a broad point-only closure match authoritative", () => {
    const incidents = matchIncidentsToRoute(route, [{
      id: "point-closure",
      type: "roadClosed",
      title: "Road closed",
      coordinates: [0.01, 0.0003],
    }]);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].routeMatch?.criticalMatch).toBe(false);
    expect(analyseRoute({ ...input([]), incidents }).level).not.toBe("closed");
  });

  it("matches an on-route slippery section as caution", () => {
    const matched = matchRoadConditionsToRoute(route, [condition("slippery", [[0.004, 0], [0.016, 0]])]);
    expect(matched).toHaveLength(1);
    expect(analyseRoute(input(matched)).level).toBe("caution");
  });
});

describe("weather station proximity", () => {
  it("ignores a station far from the route", () => {
    const station: RoadsideMeasurement = {
      id: "far-station",
      name: "Far station",
      coordinates: [0.01, 0.03],
      measurementTypes: ["wind"],
      values: { maximumWindSpeedMps: 30 },
    };
    expect(matchMeasurementsToRoute(route, [station])).toEqual([]);
  });
});

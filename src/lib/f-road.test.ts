import { describe, expect, it } from "vitest";

import { buildFRoadCatalog, findFRoad, getVehicleSuitability, normalizeFRoadQuery } from "@/lib/f-road";
import type { RoadCondition, RoadSection } from "@/types/road";

const sections: RoadSection[] = [
  { id: "208-a", name: "Fjallabaksleið nyrðri — west", roadNumbers: ["F208"], geometry: { type: "LineString", coordinates: [[-19, 64], [-18.9, 64.05]] } },
  { id: "208-b", name: "Fjallabaksleið nyrðri — east", roadNumbers: ["F 208"], geometry: { type: "LineString", coordinates: [[-18.9, 64.05], [-18.8, 64.1]] } },
  { id: "35-a", name: "Kjalvegur", roadNumbers: ["35"], geometry: { type: "LineString", coordinates: [[-20, 64.5], [-19.9, 64.6]] } },
];

function catalog(conditions: RoadCondition[]) {
  return buildFRoadCatalog({ sections, conditions, incidents: [], cameras: [], now: new Date("2026-08-15T12:00:00Z") });
}

describe("F-road lookup", () => {
  it("normalizes F208 input", () => {
    expect(normalizeFRoadQuery("F208")).toBe("F208");
    expect(normalizeFRoadQuery("f 208")).toBe("F208");
  });

  it("normalizes a bare 208 lookup", () => {
    expect(normalizeFRoadQuery("208")).toBe("F208");
    expect(findFRoad(catalog([]), "208")?.roadNumber).toBe("F208");
  });

  it("maps the established F35 search name to IRCA route 35 sections", () => {
    expect(findFRoad(catalog([]), "F35")?.sections.map(({ id }) => id)).toEqual(["35-a"]);
  });

  it("preserves mixed official section statuses", () => {
    const result = findFRoad(catalog([
      { id: "normal", locationId: "208-a", state: "normal" },
      { id: "care", locationId: "208-b", state: "passableWithCare" },
    ]), "F208");
    expect(result?.sections.map(({ status }) => status)).toEqual(["open", "caution"]);
  });

  it("keeps a closed section closed when another record is open", () => {
    const result = findFRoad(catalog([
      { id: "open", locationId: "208-a", state: "normal" },
      { id: "closed", locationId: "208-a", state: "roadClosed" },
    ]), "F208");
    expect(result?.sections[0].status).toBe("closed");
    expect(result?.sections[1].status).toBe("unknown");
  });

  it("excludes unrelated road sections", () => {
    const result = findFRoad(catalog([]), "F208");
    expect(result?.sections.map(({ id }) => id)).toEqual(["208-a", "208-b"]);
    expect(result?.sections.some(({ id }) => id === "35-a")).toBe(false);
  });
});

describe("F-road vehicle suitability", () => {
  it("warns a standard 2WD user", () => {
    expect(getVehicleSuitability("Small car (2WD)")).toMatchObject({
      level: "not-suitable",
      title: "Not suitable for a standard 2WD vehicle",
    });
  });

  it("gives SUV / 4x4 users different conditional guidance", () => {
    const result = getVehicleSuitability("SUV / 4x4");
    expect(result.level).toBe("conditional");
    expect(result.title).toBe("4×4 vehicle required");
    expect(result.detail).toContain("rental");
  });

  it("keeps suitability unknown when the category cannot establish capability", () => {
    expect(getVehicleSuitability("Electric vehicle").level).toBe("unknown");
  });
});

describe("F-road freshness", () => {
  it("marks old condition records stale", () => {
    const result = findFRoad(catalog([
      { id: "old", locationId: "208-a", state: "normal", updatedAt: "2026-08-15T08:00:00Z" },
    ]), "F208");
    expect(result?.sections[0].stale).toBe(true);
  });
});

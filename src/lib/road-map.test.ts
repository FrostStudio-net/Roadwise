import { describe, expect, it } from "vitest";

import { buildRoadMapPayload, matchRoadSectionDetails, normalizeRoadMapStatus, sectionVisibleForFilter, simplifyRoadGeometry } from "@/lib/road-map";
import type { RoadMapPayload } from "@/types/road-map";
import type { RoadCondition, RoadSection } from "@/types/road";

const officialSection: RoadSection = {
  id: "section-1",
  name: "Test road",
  roadNumbers: ["1"],
  geometry: { type: "LineString", coordinates: [[-20, 64], [-19.9, 64]] },
};

function payload(conditions: RoadCondition[], sections = [officialSection], now = new Date("2026-08-15T12:00:00Z")) {
  return buildRoadMapPayload({ sections, conditions, incidents: [], observations: [], cameras: [], now, updatedAt: "2026-08-15T11:50:00Z" });
}

describe("road map status normalization", () => {
  it("normalizes conservative official states", () => {
    expect(normalizeRoadMapStatus("normal")).toBe("normal");
    expect(normalizeRoadMapStatus("icyPatches")).toBe("caution");
    expect(normalizeRoadMapStatus("hazardous")).toBe("difficult");
    expect(normalizeRoadMapStatus("roadClosed")).toBe("closed");
    expect(normalizeRoadMapStatus("unknown")).toBe("unknown");
  });

  it("classifies a closure above another condition on the same section", () => {
    const result = payload([
      { id: "normal", locationId: "section-1", state: "normal" },
      { id: "closed", locationId: "section-1", state: "roadClosed" },
    ]);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].status).toBe("closed");
  });

  it("includes only official sections with geometry and a current condition", () => {
    const rogue: RoadSection = { id: "rogue", name: "Not in definitions", roadNumbers: ["99"], geometry: officialSection.geometry };
    const noGeometry: RoadSection = { id: "empty", name: "No geometry", roadNumbers: ["2"] };
    const result = payload([
      { id: "valid", locationId: "section-1", state: "normal" },
      { id: "rogue-condition", locationId: "rogue", section: rogue, state: "roadClosed" },
      { id: "empty-condition", locationId: "empty", state: "hazardous" },
    ], [officialSection, noGeometry]);
    expect(result.sections.map(({ id }) => id)).toEqual(["section-1"]);
  });

  it("retains a stale status and marks it stale", () => {
    const result = payload([{ id: "old", locationId: "section-1", state: "roadClosed", updatedAt: "2026-08-15T06:00:00Z" }]);
    expect(result.sections[0]).toMatchObject({ status: "closed", stale: true });
  });
});

describe("road map geometry and filters", () => {
  it("keeps simplified geometry valid", () => {
    const geometry = simplifyRoadGeometry({ type: "LineString", coordinates: [
      [-20, 64], [-19.99, 64.000001], [-19.98, 64], [-19.97, 64.000001], [-19.96, 64],
    ] });
    expect(geometry.type).toBe("LineString");
    expect(geometry.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(geometry.coordinates.length).toBeLessThan(5);
  });

  it("applies closure and difficult filters without native control state", () => {
    const sections = payload([{ id: "closed", locationId: "section-1", state: "roadClosed" }]).sections;
    expect(sectionVisibleForFilter(sections[0], "all")).toBe(true);
    expect(sectionVisibleForFilter(sections[0], "closures")).toBe(true);
    expect(sectionVisibleForFilter(sections[0], "difficult")).toBe(false);
  });
});

describe("road section nearby details", () => {
  it("selects the nearest observation and orders matching cameras", () => {
    const section = payload([{ id: "normal", locationId: "section-1", state: "normal" }]).sections[0];
    const mapPayload: RoadMapPayload = {
      generatedAt: "2026-08-15T12:00:00Z",
      sourceStale: false,
      sources: { sections: true, conditions: true, incidents: true, weather: true, cameras: true },
      sections: [section],
      incidents: [],
      observations: [
        { id: "far", name: "Far", coordinates: [-19.9, 64.15], values: {} },
        { id: "near", name: "Near", coordinates: [-19.95, 64.005], values: {} },
      ],
      cameras: [
        { id: "camera-far", name: "Far camera", roadNumber: "1", coordinates: [-19.9, 64.08], imageUrl: "https://example.com/far.jpg" },
        { id: "camera-near", name: "Near camera", roadNumber: "1", coordinates: [-19.95, 64.002], imageUrl: "https://example.com/near.jpg" },
      ],
    };
    const details = matchRoadSectionDetails(section, mapPayload);
    expect(details.observation?.id).toBe("near");
    expect(details.cameras.map(({ id }) => id)).toEqual(["camera-near", "camera-far"]);
  });
});

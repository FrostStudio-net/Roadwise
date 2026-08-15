import { describe, expect, it } from "vitest";

import { ROAD_STATUS_STYLES } from "@/lib/road-status-style";

describe("road status styles", () => {
  it("defines a semantic treatment for every overall route status", () => {
    expect(Object.keys(ROAD_STATUS_STYLES)).toEqual(["normal", "caution", "difficult", "closed"]);
  });

  it("uses Roadwise's existing good-state color for normal conditions", () => {
    expect(ROAD_STATUS_STYLES.normal.headingClass).toContain("#34d399");
    expect(ROAD_STATUS_STYLES.normal.iconClass).toContain("#34d399");
    expect(ROAD_STATUS_STYLES.normal.accentClass).toContain("#34d399");
  });
});

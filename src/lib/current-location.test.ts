import { describe, expect, it } from "vitest";

import { decideHomeLocation, HOME_LOCATION_CONFIG, homeLocationErrorStatus, locationIsStale } from "@/lib/current-location";

describe("Home location permission flow", () => {
  it("prompts before an unrequested location and respects session dismissal", () => {
    expect(decideHomeLocation("prompt", false)).toBe("prompt");
    expect(decideHomeLocation("unsupported", true)).toBe("dismissed");
  });

  it("automatically requests only an already-granted permission", () => {
    expect(decideHomeLocation("granted", false)).toBe("request");
    expect(decideHomeLocation("denied", false)).toBe("denied");
  });

  it("maps denied and timeout failures to neutral recoverable states", () => {
    expect(homeLocationErrorStatus(1)).toBe("denied");
    expect(homeLocationErrorStatus(3)).toBe("timeout");
  });

  it("expires a Home location after the configured one-shot freshness period", () => {
    const now = 1_000_000;
    expect(locationIsStale(now - HOME_LOCATION_CONFIG.staleAfterMs + 1, now)).toBe(false);
    expect(locationIsStale(now - HOME_LOCATION_CONFIG.staleAfterMs - 1, now)).toBe(true);
  });
});

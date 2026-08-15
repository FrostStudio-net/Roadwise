import { describe, expect, it } from "vitest";

import { initialMapDiagnostics, sanitizeMapError } from "@/lib/client-map";

describe("client map diagnostics", () => {
  it("never exposes a public token from an error URL", () => {
    const result = sanitizeMapError(new Error("Request failed: https://api.mapbox.com/styles?access_token=pk.secret-value"));

    expect(result.message).toContain("access_token=[redacted]");
    expect(result.message).not.toContain("pk.secret-value");
  });

  it("retains a useful Mapbox error code", () => {
    const result = sanitizeMapError({ status: 403, message: "Forbidden" });

    expect(result).toEqual({ code: "403", message: "Forbidden" });
  });

  it("starts with no map lifecycle milestones", () => {
    expect(initialMapDiagnostics(true)).toEqual({
      tokenConfigured: true,
      containerWidth: 0,
      containerHeight: 0,
      mapCreated: false,
      styleLoaded: false,
      mapLoaded: false,
    });
  });
});

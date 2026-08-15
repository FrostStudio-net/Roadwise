import { describe, expect, it, vi } from "vitest";

import {
  createLocationShareText,
  createMapsLink,
  EMERGENCY_TELEPHONE_HREF,
  formatCoordinate,
  formatCoordinatePair,
  locationStatusMessage,
  shareOrCopyLocation,
} from "@/lib/emergency-location";

const reykjavik = { latitude: 64.1466, longitude: -21.9426 };

describe("emergency location formatting", () => {
  it("formats coordinates for reading aloud", () => {
    expect(formatCoordinate(64.1466, "latitude")).toBe("64.146600° N");
    expect(formatCoordinate(-21.9426, "longitude")).toBe("21.942600° W");
    expect(formatCoordinatePair(reykjavik)).toBe("64.146600° N, 21.942600° W");
  });

  it("creates a Maps link from fixed-precision coordinates", () => {
    expect(createMapsLink(reykjavik)).toBe("https://www.google.com/maps/search/?api=1&query=64.146600%2C-21.942600");
  });

  it("creates deterministic share text", () => {
    expect(createLocationShareText(reykjavik)).toBe([
      "My current location in Iceland:",
      "64.146600° N, 21.942600° W",
      "https://www.google.com/maps/search/?api=1&query=64.146600%2C-21.942600",
    ].join("\n"));
  });
});

describe("emergency sharing", () => {
  it("uses Web Share when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const copyText = vi.fn().mockResolvedValue(undefined);
    await expect(shareOrCopyLocation(reykjavik, { share, copyText })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledOnce();
    expect(copyText).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard when Web Share fails", async () => {
    const share = vi.fn().mockRejectedValue(new Error("not supported"));
    const copyText = vi.fn().mockResolvedValue(undefined);
    await expect(shareOrCopyLocation(reykjavik, { share, copyText })).resolves.toBe("copied");
    expect(copyText).toHaveBeenCalledWith(createLocationShareText(reykjavik));
  });

  it("returns unavailable when neither sharing nor copying works", async () => {
    await expect(shareOrCopyLocation(reykjavik, {})).resolves.toBe("unavailable");
  });
});

describe("emergency failure and call states", () => {
  it("keeps useful guidance when location is unavailable", () => {
    expect(locationStatusMessage("unavailable")).toContain("112 and the safety guidance");
  });

  it("uses the direct Iceland emergency telephone link", () => {
    expect(EMERGENCY_TELEPHONE_HREF).toBe("tel:112");
  });
});

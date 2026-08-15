import { describe, expect, it } from "vitest";

import { calculateMenuPlacement } from "@/components/VehicleSelector";

const viewport = { offsetTop: 0, offsetLeft: 0, width: 390, height: 844 };

describe("vehicle menu placement", () => {
  it("opens downward when the visible viewport has room", () => {
    expect(calculateMenuPlacement({ top: 80, bottom: 152, left: 18, width: 354 }, viewport).mode).toBe("down");
  });

  it("opens upward only when that direction fits better", () => {
    expect(calculateMenuPlacement({ top: 700, bottom: 772, left: 18, width: 354 }, viewport).mode).toBe("up");
  });

  it("uses a contained sheet when neither direction fits", () => {
    const placement = calculateMenuPlacement({ top: 260, bottom: 332, left: 18, width: 354 }, { ...viewport, height: 560 });
    expect(placement.mode).toBe("sheet");
    expect(placement.top).toBeGreaterThanOrEqual(12);
    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(548);
  });
});

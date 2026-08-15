import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { BottomNavView } from "@/components/BottomNav";
import DriveEmptyState from "@/components/DriveEmptyState";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

describe("fresh app defaults", () => {
  it("renders a blank Home destination", () => {
    const markup = renderToStaticMarkup(<HomePage />);
    const destinationInput = markup.match(/<input[^>]*aria-label="Destination"[^>]*>/)?.[0];
    expect(destinationInput).toBeDefined();
    expect(destinationInput).toContain('value=""');
  });

  it("renders Drive's no-active-route actions without fabricated trip data", () => {
    const markup = renderToStaticMarkup(<DriveEmptyState onCheckDrive={() => undefined} onJustDrive={() => undefined} />);
    expect(markup).toContain("No active drive");
    expect(markup).toContain("Check a route first or use Just Drive.");
    expect(markup).toContain("Check a drive");
    expect(markup).toContain("Just Drive");
    expect(markup).not.toContain("km remaining");
  });

  it("makes the hidden navigation inert during input interaction", () => {
    const markup = renderToStaticMarkup(<BottomNavView pathname="/" hidden />);
    expect(markup).toContain('data-interaction-hidden="true"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('inert=""');
  });
});

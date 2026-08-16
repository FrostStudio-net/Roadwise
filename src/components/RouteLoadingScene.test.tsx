import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RouteLoadingScene from "@/components/RouteLoadingScene";

describe("Drive Check route loading scene", () => {
  it("renders a decorative fixed-car scene with two animated tread rings", () => {
    const markup = renderToStaticMarkup(<RouteLoadingScene />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("drive-loading-car-anchor");
    expect(markup.match(/drive-loading-tread/g)).toHaveLength(2);
    expect(markup).toContain('stroke-dasharray="3 5"');
    expect(markup).toContain("drive-loading-ridge-distant");
    expect(markup).toContain("drive-loading-ridge-near");
    expect(markup).toContain("drive-loading-road-line");
  });
});

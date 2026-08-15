import type { Map as MapboxMap } from "mapbox-gl";

export function developmentMapError(scope: "fuel" | "roads", stage: string, error?: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  const detail = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  console.warn(`[Roadwise ${scope} map] ${stage}${detail ? `: ${detail}` : ""}`);
}

export function mapContainerHasSize(container: HTMLElement): boolean {
  const rect = container.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function observeMapSize(map: MapboxMap, container: HTMLElement): () => void {
  let frame = window.requestAnimationFrame(() => map.resize());
  const resize = () => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => map.resize());
  };
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resize);
  observer?.observe(container);
  window.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("resize", resize);
  return () => {
    window.cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener("resize", resize);
    window.visualViewport?.removeEventListener("resize", resize);
  };
}

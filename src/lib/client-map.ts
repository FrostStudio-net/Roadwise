import type { Map as MapboxMap } from "mapbox-gl";

export type MapDiagnosticState = {
  tokenConfigured: boolean;
  containerWidth: number;
  containerHeight: number;
  mapCreated: boolean;
  styleLoaded: boolean;
  mapLoaded: boolean;
  mapErrorCode?: string;
  mapErrorMessage?: string;
};

export function initialMapDiagnostics(tokenConfigured: boolean): MapDiagnosticState {
  return { tokenConfigured, containerWidth: 0, containerHeight: 0, mapCreated: false, styleLoaded: false, mapLoaded: false };
}

export function developmentMapError(scope: "fuel" | "roads", stage: string, error?: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  const detail = sanitizeMapError(error).message;
  console.warn(`[Roadwise ${scope} map] ${stage}${detail ? `: ${detail}` : ""}`);
}

export function sanitizeMapError(error: unknown): { code?: string; message?: string } {
  if (!error) return {};
  const record = typeof error === "object" ? error as Record<string, unknown> : undefined;
  const rawCode = record?.status ?? record?.statusCode ?? record?.code ?? record?.type;
  const rawMessage = error instanceof Error ? error.message : typeof error === "string" ? error : record?.message;
  const message = typeof rawMessage === "string"
    ? rawMessage
      .replace(/([?&]access_token=)[^&\s]+/gi, "$1[redacted]")
      .replace(/pk\.[A-Za-z0-9._-]+/g, "[public-token]")
      .slice(0, 180)
    : undefined;
  return { code: typeof rawCode === "string" || typeof rawCode === "number" ? String(rawCode) : undefined, message };
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

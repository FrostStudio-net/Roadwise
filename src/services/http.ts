import type { FeedResult } from "@/types/road";

type NextFetchInit = RequestInit & {
  next?: { revalidate?: number };
};

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export async function fetchOfficialFeed(
  url: string,
  revalidateSeconds: number,
  accept: string,
  cacheRawResponse = true,
): Promise<{ response: Response; text: string; updatedAt?: string }> {
  const init: NextFetchInit = {
    headers: { Accept: accept, "User-Agent": "Roadwise/0.1 official-data-client" },
    ...(cacheRawResponse ? { next: { revalidate: revalidateSeconds } } : { cache: "no-store" as const }),
    // The first uncached IRCA section publication is currently ~4 MB and can
    // exceed 20 seconds when requested alongside the other DATEX feeds.
    signal: AbortSignal.timeout(45_000),
  };
  const response = await fetch(url, init);
  if (!response.ok && response.status !== 204) {
    throw new ServiceError(`Official feed returned HTTP ${response.status}`, "UPSTREAM_UNAVAILABLE");
  }
  return {
    response,
    text: response.status === 204 ? "" : await response.text(),
    updatedAt: response.headers.get("last-modified") ?? response.headers.get("date") ?? undefined,
  };
}

export function unavailableFeed<T>(data: T, message = "Live data unavailable"): FeedResult<T> {
  return { available: false, data, error: message };
}

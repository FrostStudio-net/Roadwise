import "server-only";

import { createHash } from "node:crypto";

import type { GeoJsonLineString, ImoWarning, RoadCondition, RoadIncident, RoadsideMeasurement } from "@/types/road";

export type RouteDataMatches = {
  roadConditions: RoadCondition[];
  incidents: RoadIncident[];
  measurements: RoadsideMeasurement[];
  imoWarnings: ImoWarning[];
};

const MATCH_CACHE_TTL_MS = 300_000;
const MAX_MATCH_CACHE_ENTRIES = 24;
const cache = new Map<string, { expiresAt: number; data: RouteDataMatches }>();

function cacheKey(route: GeoJsonLineString, ircaSnapshotId: string, imoVersion: string): string {
  return createHash("sha256")
    .update(JSON.stringify(route.coordinates))
    .update(ircaSnapshotId)
    .update(imoVersion)
    .digest("base64url");
}

function removeExpired(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

export function cachedRouteDataMatches(
  route: GeoJsonLineString,
  ircaSnapshotId: string,
  imoVersion: string,
  calculate: () => RouteDataMatches,
): RouteDataMatches {
  const now = Date.now();
  removeExpired(now);
  const key = cacheKey(route, ircaSnapshotId, imoVersion);
  const existing = cache.get(key);
  if (existing) return existing.data;
  const data = calculate();
  if (cache.size >= MAX_MATCH_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, expiresAt: now + MATCH_CACHE_TTL_MS });
  return data;
}

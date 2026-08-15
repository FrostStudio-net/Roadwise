import { unstable_cache } from "next/cache";

import { fetchOfficialFeed, unavailableFeed } from "@/services/http";
import { developmentError } from "@/lib/server-log";
import type { Coordinates, FeedResult, GeoJsonPolygon, ImoWarning } from "@/types/road";

const WARNINGS_URL = "https://api.vedur.is/capbroker/active/detailed/all";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parsePolygon(value: unknown): GeoJsonPolygon | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const coordinates = raw.split(/\s+/).flatMap((pair): Coordinates[] => {
    const [latitude, longitude] = pair.split(",").map(Number);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [[longitude, latitude]] : [];
  });
  if (coordinates.length < 3) return undefined;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push(first);
  return { type: "Polygon", coordinates: [coordinates] };
}

function areaDescription(value: unknown): string | undefined {
  const data = record(value);
  if (!data) return undefined;
  return Object.values(data).flatMap((item) => Array.isArray(item) ? item : [item]).map(text).find(Boolean);
}

function parseWarning(value: unknown): ImoWarning | undefined {
  const item = record(value);
  if (!item) return undefined;
  const identifier = text(item.identifier);
  const title = text(item.headline_en) ?? text(item.event_en) ?? text(item.headline_is) ?? text(item.event_is);
  if (!identifier || !title) return undefined;
  const polygonValues = Array.isArray(item.polygon) ? item.polygon : item.polygon ? [item.polygon] : [];
  return {
    identifier,
    severity: text(item.severity),
    status: text(item.msgtype),
    title,
    event: text(item.event_en) ?? text(item.event_is),
    description: text(item.description_en) ?? text(item.description_is),
    effectiveAt: text(item.onset),
    expiresAt: text(item.expires),
    sentAt: text(item.sent),
    areaId: numeric(item.area_id),
    areaDescription: areaDescription(item.geocode_en) ?? areaDescription(item.geocode_is),
    polygons: polygonValues.map(parsePolygon).filter((polygon): polygon is GeoJsonPolygon => Boolean(polygon)),
  };
}

const getActiveWarningsCached = unstable_cache(async (): Promise<FeedResult<ImoWarning[]>> => {
  const raw = await fetchOfficialFeed(WARNINGS_URL, 300, "application/json");
  if (raw.response.status === 204 || raw.text === "") {
    return { available: true, data: [], updatedAt: raw.updatedAt };
  }
  const parsed: unknown = JSON.parse(raw.text);
  if (!Array.isArray(parsed)) throw new Error("Unexpected IMO warning response");
  return {
    available: true,
    data: parsed.map(parseWarning).filter((warning): warning is ImoWarning => Boolean(warning)),
    updatedAt: raw.updatedAt,
  };
}, ["imo-active-warnings-v1"], { revalidate: 300 });

export async function getActiveWarnings(): Promise<FeedResult<ImoWarning[]>> {
  try {
    return await getActiveWarningsCached();
  } catch (error) {
    developmentError("imo:warnings", error);
    return unavailableFeed([], "IMO warnings are unavailable");
  }
}

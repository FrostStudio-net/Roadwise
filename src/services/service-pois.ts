import "server-only";

import { unstable_cache } from "next/cache";

import type { ServiceConnector, ServicePoi, ServicePoiSnapshot, ServicePoiType } from "@/types/service-poi";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const ICELAND_BBOX = "63.2,-24.8,66.7,-13.2";
const REVALIDATE_SECONDS = 21_600;

type OverpassElement = {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: { lat?: unknown; lon?: unknown };
  tags?: Record<string, unknown>;
};

type OverpassResponse = {
  osm3s?: { timestamp_osm_base?: unknown };
  elements?: unknown;
};

const query = `[out:json][timeout:60];(
  nwr["amenity"="fuel"](${ICELAND_BBOX});
  nwr["amenity"="charging_station"]["motorcar"!="no"](${ICELAND_BBOX});
);out tags center;`;

const getServicePoisCached = unstable_cache(async (): Promise<ServicePoiSnapshot> => {
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "Roadwise/0.1 Iceland service-stop client",
    },
    body: new URLSearchParams({ data: query }),
    cache: "no-store",
    signal: AbortSignal.timeout(75_000),
  });
  if (!response.ok) throw new Error(`Overpass returned HTTP ${response.status}`);
  const parsed = await response.json() as OverpassResponse;
  const elements = Array.isArray(parsed.elements) ? parsed.elements : [];
  const data = elements.flatMap(normalizeElement);
  const osmTimestamp = text(parsed.osm3s?.timestamp_osm_base);
  return {
    available: true,
    data,
    updatedAt: validTimestamp(osmTimestamp) ?? response.headers.get("date") ?? undefined,
  };
}, ["iceland-service-pois-osm-v1"], { revalidate: REVALIDATE_SECONDS });

export async function getServicePoiSnapshot(): Promise<ServicePoiSnapshot> {
  try {
    return await getServicePoisCached();
  } catch {
    return { available: false, data: [], error: "OpenStreetMap fuel and charging data is temporarily unavailable." };
  }
}

function normalizeElement(value: unknown): ServicePoi[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const element = value as OverpassElement;
  const id = typeof element.id === "number" || typeof element.id === "string" ? String(element.id) : undefined;
  const elementType = text(element.type);
  const tags = element.tags ?? {};
  const amenity = text(tags.amenity);
  const type: ServicePoiType | undefined = amenity === "fuel" ? "fuel" : amenity === "charging_station" ? "ev" : undefined;
  const latitude = number(element.lat) ?? number(element.center?.lat);
  const longitude = number(element.lon) ?? number(element.center?.lon);
  const access = text(tags.access);
  if (!id || !elementType || !type || latitude === undefined || longitude === undefined || access === "private" || access === "no") return [];
  const provider = text(tags.operator) ?? text(tags.brand) ?? text(tags.network);
  return [{
    id: `${elementType}/${id}`,
    type,
    name: text(tags.name) ?? text(tags.brand) ?? provider ?? (type === "fuel" ? "Fuel station" : "EV charging station"),
    provider,
    coordinates: [round(longitude), round(latitude)],
    openingHours: text(tags.opening_hours),
    access,
    connectors: type === "ev" ? connectors(tags) : [],
    stationOutput: type === "ev" ? text(tags["charging_station:output"]) : undefined,
    fuelTypes: type === "fuel" ? fuelTypes(tags) : [],
    source: "OpenStreetMap",
  }];
}

function connectors(tags: Record<string, unknown>): ServiceConnector[] {
  return Object.entries(tags).flatMap(([key, value]): ServiceConnector[] => {
    const match = key.match(/^socket:([^:]+)$/);
    if (!match) return [];
    const rawCount = text(value);
    if (!rawCount || rawCount === "no" || rawCount === "0") return [];
    const parsedCount = Number(rawCount);
    return [{
      type: humanize(match[1]),
      count: Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : undefined,
      output: text(tags[`${key}:output`]),
    }];
  });
}

function fuelTypes(tags: Record<string, unknown>): string[] {
  return Object.entries(tags).flatMap(([key, value]) => key.startsWith("fuel:") && text(value) === "yes" ? [humanize(key.slice(5))] : []);
}

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && Number.isFinite(Number(value)) ? Number(value) : undefined;
}

function validTimestamp(value?: string): string | undefined {
  return value && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function round(value: number): number {
  return Number(value.toFixed(5));
}

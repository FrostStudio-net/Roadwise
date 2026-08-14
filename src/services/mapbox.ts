import { ServiceError } from "@/services/http";
import type { GeocodedPlace, MapboxRoute } from "@/types/analysis";
import type { Coordinates } from "@/types/road";

const ICELAND_BBOX = "-24.7,63.1,-13.0,66.7";

type UnknownRecord = Record<string, unknown>;

function getToken(): string {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) throw new ServiceError("MAPBOX_ACCESS_TOKEN is not configured", "MAPBOX_TOKEN_MISSING", 503);
  return token;
}

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function coordinates(value: unknown): Coordinates | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const longitude = value[0];
  const latitude = value[1];
  return typeof longitude === "number" && typeof latitude === "number"
    ? [longitude, latitude]
    : undefined;
}

async function mapboxJson(url: URL): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ServiceError("Mapbox could not be reached", "MAPBOX_UNAVAILABLE");
  }
  if (!response.ok) {
    throw new ServiceError(`Mapbox returned HTTP ${response.status}`, "MAPBOX_UNAVAILABLE", response.status >= 500 ? 502 : 400);
  }
  return response.json() as Promise<unknown>;
}

export async function geocodeIceland(query: string): Promise<GeocodedPlace> {
  const trimmed = query.trim();
  if (!trimmed) throw new ServiceError("Location is required", "INVALID_LOCATION", 400);
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("access_token", getToken());
  url.searchParams.set("country", "is");
  url.searchParams.set("bbox", ICELAND_BBOX);
  url.searchParams.set("language", "en,is");
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("limit", "1");
  const body = record(await mapboxJson(url));
  const feature = record(Array.isArray(body?.features) ? body.features[0] : undefined);
  const point = coordinates(record(feature?.geometry)?.coordinates);
  if (!feature || !point) throw new ServiceError(`No Icelandic location found for “${trimmed}”`, "LOCATION_NOT_FOUND", 400);
  const properties = record(feature.properties);
  const name = text(properties?.name) ?? text(feature.text) ?? trimmed;
  return {
    name,
    fullName: text(properties?.full_address) ?? text(feature.place_name) ?? name,
    coordinates: point,
  };
}

export async function getDrivingRoute(origin: Coordinates, destination: Coordinates): Promise<MapboxRoute> {
  const coordinatePath = `${origin.join(",")};${destination.join(",")}`;
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinatePath}`);
  url.searchParams.set("access_token", getToken());
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("steps", "false");
  const body = record(await mapboxJson(url));
  const route = record(Array.isArray(body?.routes) ? body.routes[0] : undefined);
  const geometry = record(route?.geometry);
  const routeCoordinates = Array.isArray(geometry?.coordinates)
    ? geometry.coordinates.map(coordinates).filter((point): point is Coordinates => Boolean(point))
    : [];
  const distanceMeters = typeof route?.distance === "number" ? route.distance : undefined;
  const durationSeconds = typeof route?.duration === "number" ? route.duration : undefined;
  if (routeCoordinates.length < 2 || distanceMeters === undefined || durationSeconds === undefined) {
    throw new ServiceError("Mapbox returned no driveable route", "ROUTE_NOT_FOUND", 400);
  }
  return { geometry: { type: "LineString", coordinates: routeCoordinates }, distanceMeters, durationSeconds };
}

import { ServiceError } from "@/services/http";
import { developmentError } from "@/lib/server-log";
import type { DestinationSuggestion, GeocodedPlace, MapboxRoute } from "@/types/analysis";
import type { Coordinates } from "@/types/road";

const ICELAND_BBOX = "-24.7,63.1,-13.0,66.7";
const SEARCH_TYPES = "poi,place,city,locality,address,street";

type UnknownRecord = Record<string, unknown>;
type RankedGeocodedPlace = GeocodedPlace & { rank: number };

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
  } catch (error) {
    developmentError("mapbox", error);
    throw new ServiceError("Mapbox could not be reached", "MAPBOX_UNAVAILABLE");
  }
  if (!response.ok) {
    throw new ServiceError(`Mapbox returned HTTP ${response.status}`, "MAPBOX_UNAVAILABLE", response.status >= 500 ? 502 : 400);
  }
  return response.json() as Promise<unknown>;
}

function normalized(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("is").trim();
}

function contextItems(value: unknown): GeocodedPlace["context"] {
  const data = record(value);
  if (!data) return [];
  return Object.entries(data).flatMap(([type, raw]) => {
    const item = record(raw);
    const name = text(item?.name);
    if (!name) return [];
    return [{
      type,
      name,
      code: text(item?.country_code) ?? text(item?.region_code_full),
    }];
  });
}

function placeCandidate(value: unknown, query: string): RankedGeocodedPlace | undefined {
  const feature = record(value);
  const properties = record(feature?.properties);
  const point = coordinates(record(feature?.geometry)?.coordinates);
  const featureType = text(properties?.feature_type) ?? text(feature?.type);
  const name = text(properties?.name_preferred) ?? text(properties?.name) ?? text(feature?.text);
  if (!feature || !properties || !point || !featureType || !name) return undefined;

  const context = contextItems(properties.context);
  const country = context.find((item) => item.type === "country");
  if (country?.code && country.code.toUpperCase() !== "IS") return undefined;

  const fullName = text(properties.full_address) ?? text(feature.place_name) ?? name;
  const queryName = normalized(query);
  const preferredName = normalized(name);
  const alternateName = normalized(text(properties.name) ?? name);
  const placeTypeScore = featureType === "place" ? 1_000 : featureType === "locality" ? 800 : 0;
  const nameScore = preferredName === queryName || alternateName === queryName
    ? 200
    : preferredName.startsWith(`${queryName} `) || preferredName.startsWith(`${queryName} í `)
      ? 120
      : preferredName.includes(queryName)
        ? 40
        : 0;

  return {
    name,
    fullName,
    coordinates: point,
    featureType,
    mapboxId: text(properties.mapbox_id) ?? text(feature.id),
    context,
    rank: placeTypeScore + nameScore,
  };
}

function searchContext(properties: UnknownRecord): string {
  return text(properties.place_formatted)
    ?? text(properties.full_address)
    ?? contextItems(properties.context)
      .filter((item) => item.type !== "country" && item.type !== "place")
      .map((item) => item.name)
      .join(" · ");
}

function suggestion(value: unknown, query: string): (DestinationSuggestion & { rank: number }) | undefined {
  const item = record(value);
  const mapboxId = text(item?.mapbox_id);
  const name = text(item?.name_preferred) ?? text(item?.name);
  const featureType = text(item?.feature_type);
  if (!item || !mapboxId || !name || !featureType) return undefined;
  const queryName = normalized(query);
  const candidateName = normalized(name);
  const typeRank: Record<string, number> = { place: 600, city: 600, locality: 550, poi: 500, address: 150, street: 50 };
  const nameRank = candidateName === queryName ? 200 : candidateName.startsWith(queryName) ? 100 : 0;
  return {
    mapboxId,
    name,
    context: searchContext(item),
    featureType,
    rank: (typeRank[featureType] ?? 0) + nameRank,
  };
}

export async function suggestIcelandDestinations(query: string, sessionToken: string): Promise<DestinationSuggestion[]> {
  const trimmed = query.trim().normalize("NFC");
  if (trimmed.length < 2) return [];
  const url = new URL("https://api.mapbox.com/search/searchbox/v1/suggest");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("session_token", sessionToken);
  url.searchParams.set("access_token", getToken());
  url.searchParams.set("country", "IS");
  url.searchParams.set("bbox", ICELAND_BBOX);
  url.searchParams.set("language", "is");
  url.searchParams.set("types", SEARCH_TYPES);
  url.searchParams.set("limit", "10");
  const body = record(await mapboxJson(url));
  return (Array.isArray(body?.suggestions) ? body.suggestions : [])
    .map((item) => suggestion(item, trimmed))
    .filter((item): item is DestinationSuggestion & { rank: number } => Boolean(item))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 5)
    .map(({ mapboxId, name, context, featureType }) => ({ mapboxId, name, context, featureType }));
}

export async function retrieveIcelandDestination(mapboxId: string, sessionToken: string): Promise<GeocodedPlace> {
  const url = new URL(`https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}`);
  url.searchParams.set("session_token", sessionToken);
  url.searchParams.set("access_token", getToken());
  url.searchParams.set("language", "is");
  const body = record(await mapboxJson(url));
  const feature = record(Array.isArray(body?.features) ? body.features[0] : undefined);
  const properties = record(feature?.properties);
  const point = coordinates(record(feature?.geometry)?.coordinates)
    ?? coordinates(record(properties?.coordinates)?.coordinates);
  const context = contextItems(properties?.context);
  const country = context.find((item) => item.type === "country");
  const name = text(properties?.name_preferred) ?? text(properties?.name);
  const featureType = text(properties?.feature_type);
  if (!feature || !properties || !point || !name || !featureType || (country?.code && country.code.toUpperCase() !== "IS")) {
    throw new ServiceError("The selected Icelandic destination could not be resolved", "LOCATION_NOT_FOUND", 400);
  }
  return {
    name,
    fullName: text(properties.full_address) ?? text(properties.place_formatted) ?? name,
    coordinates: point,
    featureType,
    mapboxId: text(properties.mapbox_id) ?? mapboxId,
    context,
  };
}

export async function geocodeIceland(query: string): Promise<GeocodedPlace> {
  const trimmed = query.trim();
  if (!trimmed) throw new ServiceError("Location is required", "INVALID_LOCATION", 400);
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("access_token", getToken());
  url.searchParams.set("country", "IS");
  url.searchParams.set("bbox", ICELAND_BBOX);
  url.searchParams.set("language", "is,en");
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("limit", "10");
  const body = record(await mapboxJson(url));
  const candidates = (Array.isArray(body?.features) ? body.features : [])
    .map((feature) => placeCandidate(feature, trimmed))
    .filter((place): place is RankedGeocodedPlace => Boolean(place))
    .sort((a, b) => b.rank - a.rank);
  const selected = candidates[0];
  if (!selected || selected.rank === 0) {
    throw new ServiceError(`No Icelandic location found for “${trimmed}”`, "LOCATION_NOT_FOUND", 400);
  }
  return {
    name: selected.name,
    fullName: selected.fullName,
    coordinates: selected.coordinates,
    featureType: selected.featureType,
    mapboxId: selected.mapboxId,
    context: selected.context,
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

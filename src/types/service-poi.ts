import type { GeoJsonLineString } from "@/types/road";

export type ServicePoiType = "fuel" | "ev";

export type ServiceConnector = {
  type: string;
  count?: number;
  output?: string;
};

export type ServicePoi = {
  id: string;
  type: ServicePoiType;
  name: string;
  provider?: string;
  coordinates: [number, number];
  openingHours?: string;
  access?: string;
  connectors: ServiceConnector[];
  stationOutput?: string;
  fuelTypes: string[];
  source: "OpenStreetMap";
};

export type ServicePoiSnapshot = {
  available: boolean;
  data: ServicePoi[];
  updatedAt?: string;
  error?: string;
};

export type NearbyServicePoi = ServicePoi & { distanceKm: number };

export type RouteServicePoi = ServicePoi & {
  lateralDistanceKm: number;
  routePositionKm: number;
  distanceAheadKm: number;
};

export type ServiceGap = {
  fromRouteKm: number;
  toRouteKm: number;
  distanceKm: number;
};

export type StoredServiceRoute = {
  geometry: GeoJsonLineString;
  distanceKm: number;
};

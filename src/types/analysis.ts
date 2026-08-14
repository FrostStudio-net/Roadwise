import type {
  Coordinates,
  GeoJsonLineString,
  ImoWarning,
  RoadCondition,
  RoadIncident,
  RoadsideMeasurement,
} from "@/types/road";

export type VehicleType =
  | "Small car (2WD)"
  | "SUV / 4x4"
  | "Campervan"
  | "Motorhome"
  | "Electric vehicle";

export const VEHICLE_TYPES: VehicleType[] = [
  "Small car (2WD)",
  "SUV / 4x4",
  "Campervan",
  "Motorhome",
  "Electric vehicle",
];

export type RiskLevel = "normal" | "caution" | "difficult" | "closed";
export type WarningSeverity = "info" | "caution" | "difficult" | "closed";
export type WarningSource = "IRCA" | "IMO" | "Roadwise-derived";

export type RouteWarning = {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: WarningSeverity;
  source: WarningSource;
  distanceAheadKm?: number;
  coordinates?: Coordinates;
  observedAt?: string;
  updatedAt?: string;
};

export type RiskEngineInput = {
  vehicle: VehicleType;
  roadConditions: RoadCondition[];
  incidents: RoadIncident[];
  measurements: RoadsideMeasurement[];
  imoWarnings: ImoWarning[];
};

export type RouteAnalysis = {
  available: boolean;
  level: RiskLevel;
  title: string;
  summary: string;
  warnings: RouteWarning[];
};

export type GeocodedPlace = {
  name: string;
  fullName: string;
  coordinates: Coordinates;
};

export type MapboxRoute = {
  geometry: GeoJsonLineString;
  distanceMeters: number;
  durationSeconds: number;
};

export type AnalyseRouteResponse = {
  route: {
    origin: GeocodedPlace;
    destination: GeocodedPlace;
    distanceKm: number;
    durationMinutes: number;
    geometry: GeoJsonLineString;
  };
  analysis: RouteAnalysis;
  sources: {
    irca: boolean;
    imo: boolean;
    roadConditions: boolean;
    incidents: boolean;
    roadsideWeather: boolean;
    updatedAt?: string;
  };
};

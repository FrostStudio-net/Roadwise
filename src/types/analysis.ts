import type {
  Coordinates,
  GeoJsonLineString,
  MatchedLinearGeometry,
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
  sourceRecordId?: string;
  sourceType?: string;
  roadNumber?: string;
  roadName?: string;
  matchedSectionId?: string;
  matchedGeometry?: MatchedLinearGeometry;
  distanceFromRouteMeters?: number;
  distanceAheadKm?: number;
  officialCondition?: string;
  officialComment?: string;
  coordinates?: Coordinates;
  observedAt?: string;
  updatedAt?: string;
  stale?: boolean;
  affectsOverallLevel?: boolean;
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
  triggeredByWarningIds: string[];
};

export type AnalysisDebugRecord = {
  kind: "roadCondition" | "incident";
  title: string;
  type: string;
  officialStatus: string;
  source: "IRCA";
  sourceRecordId: string;
  sourceType?: string;
  roadNumber?: string;
  roadName?: string;
  matchedSectionId?: string;
  matchedGeometry?: MatchedLinearGeometry;
  distanceFromRouteMeters?: number;
  distanceAheadKm?: number;
  officialComment?: string;
  coordinates?: Coordinates;
  updatedAt?: string;
};

export type GeocodedPlace = {
  name: string;
  fullName: string;
  coordinates: Coordinates;
  featureType: string;
  mapboxId?: string;
  context: Array<{
    type: string;
    name: string;
    code?: string;
  }>;
};

export type DestinationSuggestion = {
  mapboxId: string;
  name: string;
  context: string;
  featureType: string;
};

export type MapboxRoute = {
  geometry: GeoJsonLineString;
  distanceMeters: number;
  durationSeconds: number;
};

export type AnalyseRouteResponse = {
  vehicle: VehicleType;
  route: {
    origin: GeocodedPlace;
    destination: GeocodedPlace;
    distanceKm: number;
    durationMinutes: number;
    geometry: GeoJsonLineString;
  };
  analysis: RouteAnalysis;
  sources: {
    mapbox: {
      available: boolean;
      error: string | null;
    };
    irca: {
      available: boolean;
      roadConditions: boolean;
      sectionGeometry: boolean;
      incidents: boolean;
      measurements: boolean;
      error: string | null;
    };
    imo: {
      available: boolean;
      activeWarnings: number;
      error: string | null;
    };
    updatedAt?: string;
    roadDataUpdatedAt?: string;
    roadDataAgeMinutes?: number;
    roadDataStale: boolean;
    staleAfterMinutes: number;
  };
  matches: {
    roadConditions: number;
    incidents: number;
    roadsideStations: number;
    imoWarnings: number;
  };
  debug?: {
    matchedRecords: AnalysisDebugRecord[];
  };
};

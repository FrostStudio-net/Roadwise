import type { IncidentType, MatchedLinearGeometry, MeasurementValues, RoadConditionState } from "@/types/road";

export type RoadMapStatus = "normal" | "caution" | "difficult" | "closed" | "unknown";
export type RoadMapFilter = "all" | "closures" | "difficult" | "incidents" | "weather" | "cameras";

export type RoadMapSection = {
  id: string;
  roadNumbers: string[];
  name?: string;
  status: RoadMapStatus;
  officialState: RoadConditionState;
  comment?: string;
  updatedAt?: string;
  stale: boolean;
  geometry: MatchedLinearGeometry;
};

export type RoadMapIncident = {
  id: string;
  type: IncidentType;
  title: string;
  description?: string;
  roadNumber?: string;
  roadName?: string;
  coordinates: [number, number];
  geometry?: MatchedLinearGeometry;
  updatedAt?: string;
  stale: boolean;
};

export type RoadMapObservation = {
  id: string;
  name: string;
  coordinates: [number, number];
  observedAt?: string;
  values: Pick<MeasurementValues, "windSpeedMps" | "maximumWindSpeedMps" | "airTemperatureC" | "roadSurfaceTemperatureC">;
};

export type RoadMapCamera = {
  id: string;
  name: string;
  roadName?: string;
  roadNumber?: string;
  description?: string;
  coordinates: [number, number];
  imageUrl: string;
};

export type RoadMapPayload = {
  generatedAt: string;
  updatedAt?: string;
  sourceStale: boolean;
  sources: {
    sections: boolean;
    conditions: boolean;
    incidents: boolean;
    weather: boolean;
    cameras: boolean;
  };
  sections: RoadMapSection[];
  incidents: RoadMapIncident[];
  observations: RoadMapObservation[];
  cameras: RoadMapCamera[];
};

export type RoadSectionDetails = {
  incidents: RoadMapIncident[];
  observation?: RoadMapObservation & { distanceKm: number };
  cameras: Array<RoadMapCamera & { distanceKm: number }>;
};

import type { VehicleType } from "@/types/analysis";
import type { Camera, IncidentType, RoadConditionState } from "@/types/road";

export type FRoadStatus = "open" | "caution" | "difficult" | "closed" | "unknown";

export type FRoadSectionSummary = {
  id: string;
  name: string;
  status: FRoadStatus;
  statusLabel: string;
  officialState?: RoadConditionState;
  description?: string;
  updatedAt?: string;
  stale: boolean;
};

export type FRoadIncidentSummary = {
  id: string;
  type: IncidentType;
  title: string;
  description?: string;
  updatedAt?: string;
};

export type FRoadEntry = {
  roadNumber: string;
  name?: string;
  sections: FRoadSectionSummary[];
  incidents: FRoadIncidentSummary[];
  cameras: Camera[];
};

export type VehicleSuitability = {
  level: "not-suitable" | "conditional" | "unknown";
  title: string;
  detail: string;
  vehicle: VehicleType;
};

export type FRoadSourceStatus = {
  conditionsAvailable: boolean;
  sectionsAvailable: boolean;
  incidentsAvailable: boolean;
  camerasAvailable: boolean;
  updatedAt?: string;
  stale: boolean;
};

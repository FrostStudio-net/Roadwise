import type { RouteWarning, VehicleType } from "@/types/analysis";

export type MonitorRequest = {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading?: number | null;
  speedKmh?: number | null;
  timestamp?: number;
  vehicle: VehicleType;
};

export type MonitorResponse = {
  vehicle: VehicleType;
  status: "monitoring" | "poorAccuracy";
  headingReliable: boolean;
  directionContext: "ahead" | "nearby";
  warnings: RouteWarning[];
  monitoredAt: string;
  source: {
    available: boolean;
    roadConditions: boolean;
    incidents: boolean;
    measurements: boolean;
    updatedAt?: string;
    ageMinutes?: number;
    stale: boolean;
    staleAfterMinutes: number;
    error: string | null;
  };
  matches: {
    roadConditions: number;
    incidents: number;
    roadsideStations: number;
  };
};

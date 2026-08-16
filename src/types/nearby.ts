import type { RiskLevel } from "@/types/analysis";

export type NearbyRoadStatus = RiskLevel | "unknown";

export type NearbyConditionsResponse = {
  generatedAt: string;
  radiusKm: {
    roadsAndAdvisories: number;
    weather: number;
  };
  wind: {
    available: boolean;
    status: RiskLevel | "unknown";
    speedMps?: number;
    stationName?: string;
    distanceKm?: number;
    observedAt?: string;
  };
  roads: {
    available: boolean;
    status: NearbyRoadStatus;
    matchedRecords: number;
    attentionRecords: number;
  };
  advisories: {
    available: boolean;
    status: RiskLevel | "unknown";
    count: number;
  };
  source: {
    updatedAt?: string;
    stale: boolean;
  };
};

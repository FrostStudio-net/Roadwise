import type { AnalyseRouteResponse } from "@/types/analysis";

export const ROUTE_ANALYSIS_STORAGE_KEY = "roadwise:last-route-analysis";

export function storeRouteAnalysis(analysis: AnalyseRouteResponse): void {
  try {
    sessionStorage.setItem(ROUTE_ANALYSIS_STORAGE_KEY, JSON.stringify(analysis));
  } catch {
    // Drive Mode can still render its unavailable state when storage is disabled.
  }
}

export function readRouteAnalysis(): AnalyseRouteResponse | undefined {
  try {
    const value = sessionStorage.getItem(ROUTE_ANALYSIS_STORAGE_KEY);
    return value ? JSON.parse(value) as AnalyseRouteResponse : undefined;
  } catch {
    return undefined;
  }
}

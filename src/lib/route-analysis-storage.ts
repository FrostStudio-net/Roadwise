import type { AnalyseRouteResponse } from "@/types/analysis";

export const ROUTE_ANALYSIS_STORAGE_KEY = "roadwise:last-route-analysis";

export function storeRouteAnalysis(analysis: AnalyseRouteResponse): void {
  try {
    const compact: AnalyseRouteResponse = {
      ...analysis,
      analysis: {
        ...analysis.analysis,
        warnings: analysis.analysis.warnings.map((warning) => ({ ...warning, matchedGeometry: undefined })),
      },
      debug: undefined,
    };
    sessionStorage.setItem(ROUTE_ANALYSIS_STORAGE_KEY, JSON.stringify(compact));
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

export function developmentLog(message: string): void {
  if (process.env.NODE_ENV === "development") console.info(message);
}

export function developmentError(scope: string, error: unknown): void {
  if (process.env.NODE_ENV === "development") console.error(`[${scope}]`, error);
}

export function routeTimingLog(timings: import("@/types/analysis").RouteAnalysisTimings): void {
  console.info(`[analyse:${timings.requestId}] timings ${JSON.stringify(timings)}`);
}

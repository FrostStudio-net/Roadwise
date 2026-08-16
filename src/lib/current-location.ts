export const HOME_LOCATION_CONFIG = {
  staleAfterMs: 10 * 60 * 1_000,
  requestTimeoutMs: 15_000,
  maximumCachedAgeMs: 60_000,
} as const;

export type BrowserLocationPermission = PermissionState | "unsupported";
export type HomeLocationDecision = "request" | "prompt" | "denied" | "dismissed";
export type HomeLocationErrorStatus = "denied" | "unavailable" | "timeout" | "error";

export function decideHomeLocation(permission: BrowserLocationPermission, dismissed: boolean): HomeLocationDecision {
  if (permission === "granted") return "request";
  if (permission === "denied") return "denied";
  return dismissed ? "dismissed" : "prompt";
}

export function locationIsStale(timestamp: number, now = Date.now()): boolean {
  return !Number.isFinite(timestamp) || now - timestamp > HOME_LOCATION_CONFIG.staleAfterMs;
}

export function homeLocationErrorStatus(code: number): HomeLocationErrorStatus {
  if (code === 1) return "denied";
  if (code === 2) return "unavailable";
  if (code === 3) return "timeout";
  return "error";
}

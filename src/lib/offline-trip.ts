import type { ActiveTripState } from "@/lib/route-analysis-storage";

export function savedTripAgeMinutes(activeTrip: ActiveTripState, now = Date.now()): number {
  return Math.max(0, Math.floor((now - activeTrip.analysisUpdatedAt) / 60_000));
}

export function officialTripDataAgeMinutes(activeTrip: ActiveTripState, now = Date.now()): number {
  const timestamp = activeTrip.officialDataUpdatedAt;
  return timestamp && !Number.isNaN(Date.parse(timestamp))
    ? Math.max(0, Math.floor((now - Date.parse(timestamp)) / 60_000))
    : savedTripAgeMinutes(activeTrip, now);
}

export function activeTripDataIsStale(activeTrip: ActiveTripState, now = Date.now()): boolean {
  return activeTrip.analysis.sources.roadDataStale
    || officialTripDataAgeMinutes(activeTrip, now) > activeTrip.analysis.sources.staleAfterMinutes;
}

export function savedTripClockTime(activeTrip: ActiveTripState): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Atlantic/Reykjavik" }).format(new Date(activeTrip.analysisUpdatedAt));
}

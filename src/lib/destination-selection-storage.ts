import type { GeocodedPlace } from "@/types/analysis";

const DESTINATION_SELECTION_KEY = "roadwise:selected-destination";
const DESTINATION_SELECTION_VERSION = 1;
const DESTINATION_SELECTION_TTL_MS = 30 * 60 * 1_000;

type StoredDestination = {
  version: typeof DESTINATION_SELECTION_VERSION;
  storedAt: number;
  destination: GeocodedPlace;
};

export function storeDestinationSelection(destination: GeocodedPlace): void {
  try {
    const stored: StoredDestination = { version: DESTINATION_SELECTION_VERSION, storedAt: Date.now(), destination };
    sessionStorage.setItem(DESTINATION_SELECTION_KEY, JSON.stringify(stored));
  } catch {
    // Typed destination fallback remains available when storage is disabled.
  }
}

export function readDestinationSelection(mapboxId?: string | null): GeocodedPlace | undefined {
  if (!mapboxId) return undefined;
  try {
    const value = sessionStorage.getItem(DESTINATION_SELECTION_KEY);
    if (!value) return undefined;
    const stored = JSON.parse(value) as Partial<StoredDestination>;
    const destination = stored.destination;
    const valid = stored.version === DESTINATION_SELECTION_VERSION
      && Number.isFinite(stored.storedAt)
      && Date.now() - (stored.storedAt as number) <= DESTINATION_SELECTION_TTL_MS
      && destination?.mapboxId === mapboxId
      && typeof destination.name === "string"
      && Array.isArray(destination.coordinates)
      && destination.coordinates.length === 2
      && destination.coordinates.every(Number.isFinite);
    if (!valid) {
      sessionStorage.removeItem(DESTINATION_SELECTION_KEY);
      return undefined;
    }
    return destination;
  } catch {
    return undefined;
  }
}

export function clearDestinationSelection(): void {
  try {
    sessionStorage.removeItem(DESTINATION_SELECTION_KEY);
  } catch {
    // No action required.
  }
}

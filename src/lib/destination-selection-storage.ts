import type { GeocodedPlace } from "@/types/analysis";

const DESTINATION_SELECTION_KEY = "roadwise:selected-destination";

export function storeDestinationSelection(destination: GeocodedPlace): void {
  try {
    sessionStorage.setItem(DESTINATION_SELECTION_KEY, JSON.stringify(destination));
  } catch {
    // Typed destination fallback remains available when storage is disabled.
  }
}

export function readDestinationSelection(mapboxId?: string | null): GeocodedPlace | undefined {
  try {
    const value = sessionStorage.getItem(DESTINATION_SELECTION_KEY);
    const destination = value ? JSON.parse(value) as GeocodedPlace : undefined;
    return destination && (!mapboxId || destination.mapboxId === mapboxId) ? destination : undefined;
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

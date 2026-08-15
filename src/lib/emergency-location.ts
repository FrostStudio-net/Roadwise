export type EmergencyCoordinates = {
  latitude: number;
  longitude: number;
};

export type EmergencyLocationStatus = "idle" | "requesting" | "available" | "denied" | "unavailable" | "error";
export type LocationShareResult = "shared" | "copied" | "unavailable";

export const EMERGENCY_NUMBER = "112";
export const EMERGENCY_TELEPHONE_HREF = `tel:${EMERGENCY_NUMBER}`;

type SharePayload = { title: string; text: string };
type ShareDependencies = {
  share?: (payload: SharePayload) => Promise<void>;
  copyText?: (text: string) => Promise<void>;
};

export function formatCoordinate(value: number, axis: "latitude" | "longitude"): string {
  const positive = axis === "latitude" ? "N" : "E";
  const negative = axis === "latitude" ? "S" : "W";
  return `${Math.abs(value).toFixed(6)}° ${value < 0 ? negative : positive}`;
}

export function formatCoordinatePair(coordinates: EmergencyCoordinates): string {
  return `${formatCoordinate(coordinates.latitude, "latitude")}, ${formatCoordinate(coordinates.longitude, "longitude")}`;
}

export function createMapsLink(coordinates: EmergencyCoordinates): string {
  const query = `${coordinates.latitude.toFixed(6)},${coordinates.longitude.toFixed(6)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function createLocationShareText(coordinates: EmergencyCoordinates): string {
  return [
    "My current location in Iceland:",
    formatCoordinatePair(coordinates),
    createMapsLink(coordinates),
  ].join("\n");
}

export async function shareOrCopyLocation(
  coordinates: EmergencyCoordinates,
  dependencies: ShareDependencies,
): Promise<LocationShareResult> {
  const text = createLocationShareText(coordinates);
  if (dependencies.share) {
    try {
      await dependencies.share({ title: "My current location", text });
      return "shared";
    } catch {
      // Sharing may be unavailable even when exposed by the browser. Copying
      // keeps the location recoverable from the same user action.
    }
  }
  if (dependencies.copyText) {
    try {
      await dependencies.copyText(text);
      return "copied";
    } catch {
      // The UI keeps the formatted coordinates selectable as a final fallback.
    }
  }
  return "unavailable";
}

export function locationStatusMessage(status: EmergencyLocationStatus): string {
  if (status === "denied") return "Location permission was denied. 112 and the safety guidance are still available.";
  if (status === "unavailable") return "GPS is unavailable on this device. 112 and the safety guidance are still available; read your nearest road number, landmark or sign to emergency services.";
  if (status === "error") return "Your location could not be found. Move somewhere with a clearer view of the sky if it is safe to do so.";
  if (status === "requesting") return "Finding your current location…";
  return "Tap below to get your current GPS position.";
}

import { fetchOfficialFeed, unavailableFeed } from "@/services/http";
import type { Camera, FeedResult } from "@/types/road";

const CAMERAS_URL = "https://gagnaveita.vegagerdin.is/api/vefmyndavelar2014_1";

type CameraRow = {
  Maelist_nr?: unknown;
  Myndavel?: unknown;
  Vegheiti?: unknown;
  NrVegur?: unknown;
  Skyring?: unknown;
  Slod?: unknown;
  Breidd?: unknown;
  Lengd?: unknown;
};

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() :
    typeof value === "number" ? String(value) : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function getCameras(): Promise<FeedResult<Camera[]>> {
  try {
    const raw = await fetchOfficialFeed(CAMERAS_URL, 900, "application/json");
    const parsed: unknown = JSON.parse(raw.text);
    if (!Array.isArray(parsed)) throw new Error("Unexpected camera response");
    const cameras = parsed.flatMap((value, index): Camera[] => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
      const row = value as CameraRow;
      const latitude = number(row.Breidd);
      const longitude = number(row.Lengd);
      const imageUrl = text(row.Slod);
      const name = text(row.Myndavel);
      if (latitude === undefined || longitude === undefined || !imageUrl || !name) return [];
      return [{
        id: `${text(row.Maelist_nr) ?? "camera"}-${index}`,
        name,
        roadName: text(row.Vegheiti),
        roadNumber: text(row.NrVegur),
        description: text(row.Skyring),
        coordinates: [longitude, latitude],
        imageUrl,
      }];
    });
    return { available: true, data: cameras, updatedAt: raw.updatedAt };
  } catch {
    return unavailableFeed([], "IRCA camera data is unavailable");
  }
}

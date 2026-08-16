import { NextResponse } from "next/server";

import { createChargingOutlook } from "@/lib/charging-outlook";
import { getServicePoiSnapshot } from "@/services/service-pois";
import type { GeoJsonLineString } from "@/types/road";

export const runtime = "nodejs";

type ChargingOutlookRequest = {
  route: GeoJsonLineString;
  distanceKm: number;
};

export async function POST(request: Request) {
  try {
    const value: unknown = await request.json();
    if (!isChargingOutlookRequest(value)) {
      return NextResponse.json({ error: "A valid checked route is required" }, { status: 400 });
    }
    const snapshot = await getServicePoiSnapshot();
    if (!snapshot.available) {
      return NextResponse.json({ available: false, error: snapshot.error ?? "Charging data is temporarily unavailable" });
    }
    return NextResponse.json({
      available: true,
      ...createChargingOutlook(value.route, value.distanceKm, snapshot.data),
      updatedAt: snapshot.updatedAt,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ available: false, error: "Charging outlook is temporarily unavailable" }, { status: 502 });
  }
}

function isChargingOutlookRequest(value: unknown): value is ChargingOutlookRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (typeof body.distanceKm !== "number" || !Number.isFinite(body.distanceKm) || body.distanceKm <= 0) return false;
  if (!body.route || typeof body.route !== "object") return false;
  const route = body.route as Record<string, unknown>;
  if (route.type !== "LineString" || !Array.isArray(route.coordinates) || route.coordinates.length < 2 || route.coordinates.length > 20_000) return false;
  return route.coordinates.every((coordinate) => Array.isArray(coordinate)
    && coordinate.length >= 2
    && typeof coordinate[0] === "number"
    && Number.isFinite(coordinate[0])
    && coordinate[0] >= -180
    && coordinate[0] <= 180
    && typeof coordinate[1] === "number"
    && Number.isFinite(coordinate[1])
    && coordinate[1] >= -90
    && coordinate[1] <= 90);
}

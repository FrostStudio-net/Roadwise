import { NextResponse } from "next/server";

import { summarizeNearbyConditions } from "@/lib/nearby-conditions";
import { developmentError } from "@/lib/server-log";
import { getIrcaData } from "@/services/vegagerdin";
import { VEHICLE_TYPES } from "@/types/analysis";
import type { VehicleType } from "@/types/analysis";

export const runtime = "nodejs";

type NearbyRequest = {
  latitude: number;
  longitude: number;
  vehicle: VehicleType;
};

export async function POST(request: Request) {
  try {
    const value: unknown = await request.json();
    if (!isNearbyRequest(value)) {
      return NextResponse.json({ error: "A valid Icelandic location and supported vehicle are required" }, { status: 400 });
    }
    const irca = await getIrcaData();
    const result = summarizeNearbyConditions({
      coordinates: [value.longitude, value.latitude],
      vehicle: value.vehicle,
      roadConditions: irca.roadConditions.data,
      incidents: irca.incidents.data,
      measurements: irca.measurements.data,
      availability: {
        roadConditions: irca.roadConditions.available,
        sectionGeometry: irca.sections.available,
        incidents: irca.incidents.available,
        measurements: irca.measurements.available,
      },
      updatedAt: irca.roadConditions.updatedAt,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    developmentError("nearby", error);
    return NextResponse.json({ error: "Nearby official information is temporarily unavailable" }, { status: 502 });
  }
}

function isNearbyRequest(value: unknown): value is NearbyRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return finiteInRange(body.latitude, 63.1, 66.7)
    && finiteInRange(body.longitude, -24.7, -13)
    && typeof body.vehicle === "string"
    && VEHICLE_TYPES.includes(body.vehicle as VehicleType);
}

function finiteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

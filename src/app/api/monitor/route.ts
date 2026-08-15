import { NextResponse } from "next/server";

import { monitorForwardHazards } from "@/lib/forward-hazard-monitor";
import { RISK_THRESHOLDS } from "@/lib/risk-engine";
import { developmentError } from "@/lib/server-log";
import { getIrcaData } from "@/services/vegagerdin";
import { VEHICLE_TYPES } from "@/types/analysis";
import type { VehicleType } from "@/types/analysis";
import type { MonitorRequest, MonitorResponse } from "@/types/monitor";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const value: unknown = await request.json();
    if (!isMonitorRequest(value)) {
      return NextResponse.json({ error: "A valid Icelandic location, GPS accuracy and vehicle are required" }, { status: 400 });
    }

    const irca = await getIrcaData();
    const result = monitorForwardHazards({
      coordinates: [value.longitude, value.latitude],
      accuracyMeters: value.accuracy,
      headingDegrees: value.heading ?? undefined,
      speedKmh: value.speedKmh ?? undefined,
      vehicle: value.vehicle,
      roadConditions: irca.roadConditions.data,
      incidents: irca.incidents.data,
      measurements: irca.measurements.data,
    });
    const updatedAt = irca.roadConditions.updatedAt;
    const ageMinutes = sourceAgeMinutes(updatedAt);
    const staleAfterMinutes = RISK_THRESHOLDS.freshness.roadDataStaleAfterMinutes;
    const available = irca.roadConditions.available && irca.sections.available;

    const response: MonitorResponse = {
      vehicle: value.vehicle,
      ...result,
      monitoredAt: new Date().toISOString(),
      source: {
        available,
        roadConditions: irca.roadConditions.available,
        sectionGeometry: irca.sections.available,
        incidents: irca.incidents.available,
        measurements: irca.measurements.available,
        updatedAt,
        ageMinutes,
        stale: ageMinutes !== undefined && ageMinutes > staleAfterMinutes,
        staleAfterMinutes,
        error: sourceError(irca),
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    developmentError("monitor", error);
    return NextResponse.json({ error: "Live hazard monitoring is temporarily unavailable" }, { status: 502 });
  }
}

function isMonitorRequest(value: unknown): value is MonitorRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return finiteInRange(body.latitude, 63.1, 66.7)
    && finiteInRange(body.longitude, -24.7, -13)
    && finiteInRange(body.accuracy, 0, 10_000)
    && (body.heading === undefined || body.heading === null || finiteInRange(body.heading, 0, 360))
    && (body.speedKmh === undefined || body.speedKmh === null || finiteInRange(body.speedKmh, 0, 250))
    && typeof body.vehicle === "string"
    && VEHICLE_TYPES.includes(body.vehicle as VehicleType);
}

function finiteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function sourceAgeMinutes(value?: string): number | undefined {
  if (!value || Number.isNaN(Date.parse(value))) return undefined;
  return Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
}

function sourceError(irca: Awaited<ReturnType<typeof getIrcaData>>): string | null {
  if (!irca.roadConditions.available) return "IRCA road conditions are unavailable";
  if (!irca.sections.available) return "IRCA section geometry is unavailable";
  const unavailable = [
    !irca.incidents.available ? "incidents" : undefined,
    !irca.measurements.available ? "measurements" : undefined,
  ].filter((value): value is string => Boolean(value));
  return unavailable.length > 0 ? `Optional IRCA data unavailable: ${unavailable.join(", ")}` : null;
}

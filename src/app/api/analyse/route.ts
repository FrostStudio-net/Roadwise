import { NextResponse } from "next/server";

import {
  matchImoWarningsToRoute,
  matchIncidentsToRoute,
  matchMeasurementsToRoute,
  matchRoadConditionsToRoute,
} from "@/lib/geo";
import { analyseRoute } from "@/lib/risk-engine";
import { ServiceError } from "@/services/http";
import { geocodeIceland, getDrivingRoute } from "@/services/mapbox";
import { getIrcaData } from "@/services/vegagerdin";
import { getActiveWarnings } from "@/services/vedur";
import { VEHICLE_TYPES } from "@/types/analysis";
import type { AnalyseRouteResponse, VehicleType } from "@/types/analysis";

export const runtime = "nodejs";

type RequestBody = {
  origin: string;
  destination: string;
  vehicle: VehicleType;
};

function isRequestBody(value: unknown): value is RequestBody {
  if (value === null || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return typeof body.origin === "string"
    && body.origin.trim().length > 0
    && typeof body.destination === "string"
    && body.destination.trim().length > 0
    && typeof body.vehicle === "string"
    && VEHICLE_TYPES.includes(body.vehicle as VehicleType);
}

function latestDate(values: Array<string | undefined>): string | undefined {
  const dates = values
    .filter((value): value is string => Boolean(value) && !Number.isNaN(Date.parse(value as string)))
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return dates[0];
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } }, { status: 400 });
  }
  if (!isRequestBody(body)) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Origin, destination and a supported vehicle are required" } }, { status: 400 });
  }

  try {
    const officialDataPromise = Promise.all([getIrcaData(), getActiveWarnings()]);
    const [origin, destination, [irca, imo]] = await Promise.all([
      geocodeIceland(body.origin),
      geocodeIceland(body.destination),
      officialDataPromise,
    ]);
    const route = await getDrivingRoute(origin.coordinates, destination.coordinates);

    const roadConditions = irca.roadConditions.available && irca.sections.available
      ? matchRoadConditionsToRoute(route.geometry, irca.roadConditions.data)
      : [];
    const incidents = irca.incidents.available
      ? matchIncidentsToRoute(route.geometry, irca.incidents.data)
      : [];
    const measurements = irca.measurements.available
      ? matchMeasurementsToRoute(route.geometry, irca.measurements.data)
      : [];
    const imoWarnings = imo.available
      ? matchImoWarningsToRoute(route.geometry, imo.data)
      : [];

    const computed = analyseRoute({ vehicle: body.vehicle, roadConditions, incidents, measurements, imoWarnings });
    const criticalRoadDataAvailable = irca.roadConditions.available && irca.sections.available;
    const analysis = criticalRoadDataAvailable
      ? computed
      : {
          ...computed,
          available: false,
          title: "Live data unavailable",
          summary: "Live road data is currently unavailable. Check Umferðin and official sources before driving.",
        };

    const response: AnalyseRouteResponse = {
      route: {
        origin,
        destination,
        distanceKm: Math.round(route.distanceMeters / 100) / 10,
        durationMinutes: Math.round(route.durationSeconds / 60),
        geometry: route.geometry,
      },
      analysis,
      sources: {
        irca: criticalRoadDataAvailable,
        imo: imo.available,
        roadConditions: criticalRoadDataAvailable,
        incidents: irca.incidents.available,
        roadsideWeather: irca.measurements.available,
        updatedAt: latestDate([
          irca.roadConditions.updatedAt,
          irca.incidents.updatedAt,
          irca.measurements.updatedAt,
          imo.updatedAt,
        ]),
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json(
      { error: { code: "ANALYSIS_FAILED", message: "Live route analysis is currently unavailable" } },
      { status: 502 },
    );
  }
}

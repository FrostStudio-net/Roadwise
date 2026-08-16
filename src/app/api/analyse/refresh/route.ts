import { NextResponse } from "next/server";

import { matchImoWarningsToRoute, matchIncidentsToRoute, matchMeasurementsToRoute, matchRoadConditionsToRoute } from "@/lib/geo";
import { cachedRouteDataMatches } from "@/lib/route-matching-cache";
import { analyseRoute, RISK_THRESHOLDS } from "@/lib/risk-engine";
import { developmentError } from "@/lib/server-log";
import { getIrcaData } from "@/services/vegagerdin";
import { getActiveWarnings } from "@/services/vedur";
import { VEHICLE_TYPES } from "@/types/analysis";
import type { RouteConditionsRefreshResponse, VehicleType } from "@/types/analysis";
import type { GeoJsonLineString } from "@/types/road";

export const runtime = "nodejs";

type RefreshRequest = {
  route: GeoJsonLineString;
  vehicle: VehicleType;
};

export async function POST(request: Request) {
  try {
    const value: unknown = await request.json();
    if (!isRefreshRequest(value)) {
      return NextResponse.json({ error: "A valid saved route and supported vehicle are required" }, { status: 400 });
    }
    const [irca, imo] = await Promise.all([getIrcaData(), getActiveWarnings()]);
    if (!irca.roadConditions.available || !irca.sections.available) {
      return NextResponse.json({ error: "Official road conditions are temporarily unavailable" }, { status: 503 });
    }
    const { roadConditions, incidents, measurements, imoWarnings } = cachedRouteDataMatches(
      value.route,
      irca.snapshotId,
      imo.updatedAt ?? imo.data.map((warning) => warning.identifier).join(","),
      () => ({
        roadConditions: matchRoadConditionsToRoute(value.route, irca.roadConditions.data),
        incidents: irca.incidents.available ? matchIncidentsToRoute(value.route, irca.incidents.data) : [],
        measurements: irca.measurements.available ? matchMeasurementsToRoute(value.route, irca.measurements.data) : [],
        imoWarnings: imo.available ? matchImoWarningsToRoute(value.route, imo.data) : [],
      }),
    );
    const analysis = analyseRoute({ vehicle: value.vehicle, roadConditions, incidents, measurements, imoWarnings });
    const roadDataUpdatedAt = irca.roadConditions.updatedAt;
    const roadDataAgeMinutes = ageMinutes(roadDataUpdatedAt);
    const response: RouteConditionsRefreshResponse = {
      analysis,
      sources: {
        irca: {
          available: true,
          roadConditions: true,
          sectionGeometry: true,
          incidents: irca.incidents.available,
          measurements: irca.measurements.available,
          error: optionalIrcaError(irca.incidents.available, irca.measurements.available),
        },
        imo: {
          available: imo.available,
          activeWarnings: imo.data.length,
          error: imo.available ? null : "IMO weather warnings are unavailable",
        },
        updatedAt: latestDate([roadDataUpdatedAt, irca.incidents.updatedAt, irca.measurements.updatedAt, imo.updatedAt]),
        roadDataUpdatedAt,
        roadDataAgeMinutes,
        roadDataStale: roadDataAgeMinutes !== undefined && roadDataAgeMinutes > RISK_THRESHOLDS.freshness.roadDataStaleAfterMinutes,
        staleAfterMinutes: RISK_THRESHOLDS.freshness.roadDataStaleAfterMinutes,
      },
      matches: {
        roadConditions: roadConditions.length,
        incidents: incidents.length,
        roadsideStations: measurements.length,
        imoWarnings: imoWarnings.length,
      },
      refreshedAt: new Date().toISOString(),
    };
    return NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    developmentError("analyse:refresh", error);
    return NextResponse.json({ error: "Official route conditions could not be refreshed" }, { status: 502 });
  }
}

function isRefreshRequest(value: unknown): value is RefreshRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (typeof body.vehicle !== "string" || !VEHICLE_TYPES.includes(body.vehicle as VehicleType)) return false;
  if (!body.route || typeof body.route !== "object") return false;
  const route = body.route as Record<string, unknown>;
  return route.type === "LineString"
    && Array.isArray(route.coordinates)
    && route.coordinates.length >= 2
    && route.coordinates.length <= 20_000
    && route.coordinates.every(validCoordinate);
}

function validCoordinate(value: unknown): boolean {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && value[0] >= -180 && value[0] <= 180
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
    && value[1] >= -90 && value[1] <= 90;
}

function latestDate(values: Array<string | undefined>): string | undefined {
  return values.filter((value): value is string => Boolean(value) && !Number.isNaN(Date.parse(value as string))).sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

function ageMinutes(value?: string): number | undefined {
  if (!value || Number.isNaN(Date.parse(value))) return undefined;
  return Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
}

function optionalIrcaError(incidentsAvailable: boolean, measurementsAvailable: boolean): string | null {
  const unavailable = [!incidentsAvailable ? "incidents" : undefined, !measurementsAvailable ? "measurements" : undefined].filter((value): value is string => Boolean(value));
  return unavailable.length ? `Optional IRCA data unavailable: ${unavailable.join(", ")}` : null;
}

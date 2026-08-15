import { NextResponse } from "next/server";

import {
  matchImoWarningsToRoute,
  matchIncidentsToRoute,
  matchMeasurementsToRoute,
  matchRoadConditionsToRoute,
} from "@/lib/geo";
import { analyseRoute, RISK_THRESHOLDS } from "@/lib/risk-engine";
import { developmentError, developmentLog } from "@/lib/server-log";
import { ServiceError } from "@/services/http";
import { geocodeIceland, getDrivingRoute } from "@/services/mapbox";
import { getIrcaData } from "@/services/vegagerdin";
import { getActiveWarnings } from "@/services/vedur";
import { VEHICLE_TYPES } from "@/types/analysis";
import type { AnalyseRouteResponse, AnalysisDebugRecord, GeocodedPlace, VehicleType } from "@/types/analysis";
import type { Coordinates, RoadCondition } from "@/types/road";

export const runtime = "nodejs";

type RequestBody = {
  origin: string;
  destination: string;
  destinationSelection?: GeocodedPlace;
  vehicle: VehicleType;
};

function isDestinationSelection(value: unknown): value is GeocodedPlace {
  if (!value || typeof value !== "object") return false;
  const place = value as Record<string, unknown>;
  const point = place.coordinates;
  return typeof place.name === "string"
    && typeof place.fullName === "string"
    && typeof place.featureType === "string"
    && typeof place.mapboxId === "string"
    && Array.isArray(place.context)
    && Array.isArray(point)
    && point.length === 2
    && typeof point[0] === "number"
    && typeof point[1] === "number"
    && point[0] >= -24.7 && point[0] <= -13
    && point[1] >= 63.1 && point[1] <= 66.7;
}

function isRequestBody(value: unknown): value is RequestBody {
  if (value === null || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return typeof body.origin === "string"
    && body.origin.trim().length > 0
    && typeof body.destination === "string"
    && body.destination.trim().length > 0
    && typeof body.vehicle === "string"
    && VEHICLE_TYPES.includes(body.vehicle as VehicleType)
    && (body.destinationSelection === undefined || isDestinationSelection(body.destinationSelection));
}

function latestDate(values: Array<string | undefined>): string | undefined {
  const dates = values
    .filter((value): value is string => Boolean(value) && !Number.isNaN(Date.parse(value as string)))
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return dates[0];
}

function ageMinutes(value?: string): number | undefined {
  if (!value || Number.isNaN(Date.parse(value))) return undefined;
  return Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
}

function coordinateLabel(coordinates: [number, number]): string {
  return `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
}

function ircaError(irca: Awaited<ReturnType<typeof getIrcaData>>): string | null {
  if (!irca.roadConditions.available) return "IRCA road conditions are unavailable";
  const optional = [
    !irca.sections.available ? "section geometry" : undefined,
    !irca.incidents.available ? "incidents" : undefined,
    !irca.measurements.available ? "measurements" : undefined,
  ].filter((value): value is string => Boolean(value));
  return optional.length > 0 ? `Optional IRCA data unavailable: ${optional.join(", ")}` : null;
}

function unavailableSources(mapboxAvailable: boolean, mapboxError: string) {
  return {
    mapbox: { available: mapboxAvailable, error: mapboxAvailable ? null : mapboxError },
    irca: {
      available: false,
      roadConditions: false,
      sectionGeometry: false,
      incidents: false,
      measurements: false,
      error: "Not checked because routing failed",
    },
    imo: { available: false, activeWarnings: 0, error: "Not checked because routing failed" },
  };
}

function conditionCoordinate(condition: RoadCondition): Coordinates | undefined {
  const geometry = condition.section?.geometry;
  if (!geometry) return undefined;
  return geometry.type === "LineString" ? geometry.coordinates[0] : geometry.coordinates[0]?.[0];
}

export async function POST(request: Request) {
  let body: unknown;
  let mapboxAvailable = false;
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
    const origin = await geocodeIceland(body.origin);
    developmentLog(`[analyse] geocoded ${body.origin} -> ${origin.fullName} (${coordinateLabel(origin.coordinates)})`);
    const destination = body.destinationSelection ?? await geocodeIceland(body.destination);
    developmentLog(`[analyse] geocoded ${body.destination} -> ${destination.fullName} (${coordinateLabel(destination.coordinates)})`);
    const route = await getDrivingRoute(origin.coordinates, destination.coordinates);
    mapboxAvailable = true;
    developmentLog(`[analyse] mapbox route ${(route.distanceMeters / 1_000).toFixed(1)} km`);
    const [irca, imo] = await officialDataPromise;
    developmentLog(`[analyse] IRCA: ${irca.roadConditions.data.length} road conditions, ${irca.incidents.data.length} incidents, ${irca.measurements.data.length} measurements`);

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
    developmentLog(`[analyse] matched: ${roadConditions.length} conditions, ${incidents.length} incidents, ${measurements.length} stations`);
    developmentLog(`[analyse] IMO: ${imo.data.length} active warnings`);

    const computed = analyseRoute({ vehicle: body.vehicle, roadConditions, incidents, measurements, imoWarnings });
    const coreRoadDataAvailable = irca.roadConditions.available;
    const analysis = coreRoadDataAvailable
      ? computed
      : {
          ...computed,
          available: false,
          title: "Live data unavailable",
          summary: "Live road data is currently unavailable. Check Umferðin and official sources before driving.",
        };
    developmentLog(`[analyse] risk: ${analysis.available ? analysis.level : "unavailable"}`);
    if (analysis.level !== "normal") {
      analysis.warnings.filter((warning) => warning.affectsOverallLevel).forEach((warning) => {
        developmentLog(`[analyse] trigger: ${warning.sourceRecordId ?? warning.id} ${warning.officialCondition ?? warning.type} ${warning.roadNumber ?? warning.roadName ?? "unknown road"} (${warning.distanceFromRouteMeters ?? "?"} m from route)`);
      });
    }

    const roadDataUpdatedAt = latestDate([irca.roadConditions.updatedAt, irca.incidents.updatedAt]);
    const roadDataAgeMinutes = ageMinutes(roadDataUpdatedAt);

    const response: AnalyseRouteResponse = {
      vehicle: body.vehicle,
      route: {
        origin,
        destination,
        distanceKm: Math.round(route.distanceMeters / 100) / 10,
        durationMinutes: Math.round(route.durationSeconds / 60),
        geometry: route.geometry,
      },
      analysis,
      sources: {
        mapbox: { available: true, error: null },
        irca: {
          available: coreRoadDataAvailable,
          roadConditions: irca.roadConditions.available,
          sectionGeometry: irca.sections.available,
          incidents: irca.incidents.available,
          measurements: irca.measurements.available,
          error: ircaError(irca),
        },
        imo: {
          available: imo.available,
          activeWarnings: imo.data.length,
          error: imo.available ? null : "IMO weather warnings are unavailable",
        },
        updatedAt: latestDate([
          irca.roadConditions.updatedAt,
          irca.incidents.updatedAt,
          irca.measurements.updatedAt,
          imo.updatedAt,
        ]),
        roadDataUpdatedAt,
        roadDataAgeMinutes,
        roadDataStale: roadDataAgeMinutes !== undefined
          && roadDataAgeMinutes > RISK_THRESHOLDS.freshness.roadDataStaleAfterMinutes,
        staleAfterMinutes: RISK_THRESHOLDS.freshness.roadDataStaleAfterMinutes,
      },
      matches: {
        roadConditions: roadConditions.length,
        incidents: incidents.length,
        roadsideStations: measurements.length,
        imoWarnings: imoWarnings.length,
      },
      ...(process.env.NODE_ENV === "development" ? {
        debug: {
          matchedRecords: [
            ...roadConditions.map((condition): AnalysisDebugRecord => ({
              kind: "roadCondition",
              title: condition.state,
              type: condition.state,
              officialStatus: condition.state,
              source: "IRCA",
              sourceRecordId: condition.id,
              sourceType: condition.sourceType,
              roadNumber: condition.section?.roadNumbers.join(", ") || undefined,
              roadName: condition.section?.name,
              matchedSectionId: condition.section?.id,
              matchedGeometry: condition.routeMatch?.matchedGeometry,
              distanceFromRouteMeters: condition.routeMatch?.distanceFromRouteMeters,
              distanceAheadKm: condition.routeMatch?.distanceAheadKm,
              officialComment: condition.description,
              coordinates: conditionCoordinate(condition),
              updatedAt: condition.updatedAt,
            })),
            ...incidents.map((incident): AnalysisDebugRecord => ({
              kind: "incident",
              title: incident.title,
              type: incident.type,
              officialStatus: incident.type,
              source: "IRCA",
              sourceRecordId: incident.id,
              sourceType: incident.sourceType,
              roadNumber: incident.roadNumber,
              roadName: incident.roadName,
              matchedGeometry: incident.routeMatch?.matchedGeometry,
              distanceFromRouteMeters: incident.routeMatch?.distanceFromRouteMeters,
              distanceAheadKm: incident.routeMatch?.distanceAheadKm,
              officialComment: incident.description,
              coordinates: incident.coordinates,
              updatedAt: incident.updatedAt,
            })),
          ],
        },
      } : {}),
    };
    return NextResponse.json(response);
  } catch (error) {
    developmentError("analyse", error);
    if (error instanceof ServiceError) {
      return NextResponse.json({
        error: { code: error.code, message: error.message },
        sources: unavailableSources(mapboxAvailable, error.message),
      }, { status: error.status });
    }
    return NextResponse.json(
      {
        error: { code: "ANALYSIS_FAILED", message: "Live route analysis is currently unavailable" },
        sources: unavailableSources(mapboxAvailable, "Mapbox route analysis failed"),
      },
      { status: 502 },
    );
  }
}

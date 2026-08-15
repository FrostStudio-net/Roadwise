import FRoadAssistantClient from "@/components/FRoadAssistantClient";
import { buildFRoadCatalog, isFRoadSourceStale } from "@/lib/f-road";
import { getCameras } from "@/services/cameras";
import { getIrcaData } from "@/services/vegagerdin";
import { VEHICLE_TYPES } from "@/types/analysis";
import type { VehicleType } from "@/types/analysis";
import type { FRoadSourceStatus } from "@/types/f-road";

export const revalidate = 0;

export default async function FRoadsPage({ searchParams }: {
  searchParams: Promise<{ vehicle?: string | string[] }>;
}) {
  const [irca, cameras, params] = await Promise.all([getIrcaData(), getCameras(), searchParams]);
  const requested = Array.isArray(params.vehicle) ? params.vehicle[0] : params.vehicle;
  const initialVehicle = requested && VEHICLE_TYPES.includes(requested as VehicleType)
    ? requested as VehicleType
    : "Small car (2WD)";
  const updatedAt = latestDate([
    irca.sections.updatedAt,
    irca.roadConditions.updatedAt,
    irca.incidents.updatedAt,
    cameras.updatedAt,
  ]);
  const sourceStatus: FRoadSourceStatus = {
    sectionsAvailable: irca.sections.available,
    conditionsAvailable: irca.roadConditions.available,
    incidentsAvailable: irca.incidents.available,
    camerasAvailable: cameras.available,
    updatedAt,
    stale: isFRoadSourceStale(updatedAt),
  };
  const catalog = buildFRoadCatalog({
    sections: irca.sections.data,
    conditions: irca.roadConditions.data,
    incidents: irca.incidents.data,
    cameras: cameras.data,
  });

  return <FRoadAssistantClient catalog={catalog} initialVehicle={initialVehicle} sourceStatus={sourceStatus} />;
}

function latestDate(values: Array<string | undefined>): string | undefined {
  return values
    .filter((value): value is string => Boolean(value) && !Number.isNaN(Date.parse(value as string)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

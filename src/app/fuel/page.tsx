import FuelClient from "@/components/FuelClient";
import { getServicePoiSnapshot } from "@/services/service-pois";
import { VEHICLE_TYPES } from "@/types/analysis";
import type { VehicleType } from "@/types/analysis";

export const revalidate = 0;

export default async function FuelPage({ searchParams }: {
  searchParams: Promise<{ vehicle?: string | string[] }>;
}) {
  const [initialSnapshot, params] = await Promise.all([getServicePoiSnapshot(), searchParams]);
  const requested = Array.isArray(params.vehicle) ? params.vehicle[0] : params.vehicle;
  const initialVehicle = requested && VEHICLE_TYPES.includes(requested as VehicleType)
    ? requested as VehicleType
    : "Small car (2WD)";

  return <FuelClient initialSnapshot={initialSnapshot} initialVehicle={initialVehicle} mapConfigured={Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim())} />;
}

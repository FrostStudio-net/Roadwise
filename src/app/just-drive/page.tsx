import JustDriveClient from "@/components/JustDriveClient";
import { VEHICLE_TYPES } from "@/types/analysis";
import type { VehicleType } from "@/types/analysis";

export default async function JustDrivePage({ searchParams }: {
  searchParams: Promise<{ vehicle?: string | string[] }>;
}) {
  const value = (await searchParams).vehicle;
  const requestedVehicle = Array.isArray(value) ? value[0] : value;
  const initialVehicle = requestedVehicle && VEHICLE_TYPES.includes(requestedVehicle as VehicleType)
    ? requestedVehicle as VehicleType
    : "Small car (2WD)";
  return <JustDriveClient initialVehicle={initialVehicle} />;
}

import { Suspense } from "react";

import DataPageLoading from "@/components/DataPageLoading";
import FuelClient from "@/components/FuelClient";
import { getServicePoiSnapshot } from "@/services/service-pois";
import { VEHICLE_TYPES } from "@/types/analysis";
import type { VehicleType } from "@/types/analysis";

export const revalidate = 21_600;

export default function FuelPage({ searchParams }: {
  searchParams: Promise<{ vehicle?: string | string[]; mode?: string | string[]; filter?: string | string[] }>;
}) {
  return <Suspense fallback={<DataPageLoading title="Fuel / EV" subtitle="Roadwise-listed service stops" map />}><FuelData searchParams={searchParams} /></Suspense>;
}

async function FuelData({ searchParams }: { searchParams: Promise<{ vehicle?: string | string[]; mode?: string | string[]; filter?: string | string[] }> }) {
  const [initialSnapshot, params] = await Promise.all([getServicePoiSnapshot(), searchParams]);
  const requested = Array.isArray(params.vehicle) ? params.vehicle[0] : params.vehicle;
  const initialVehicle = requested && VEHICLE_TYPES.includes(requested as VehicleType)
    ? requested as VehicleType
    : "Small car (2WD)";
  const requestedMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const requestedFilter = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const initialMode = requestedMode === "route" ? "route" : "nearby";
  const initialFilter = requestedFilter === "ev" || requestedFilter === "fuel" || requestedFilter === "all"
    ? requestedFilter
    : initialVehicle === "Electric vehicle" ? "ev" : "fuel";

  return <FuelClient initialSnapshot={initialSnapshot} initialVehicle={initialVehicle} initialMode={initialMode} initialFilter={initialFilter} mapConfigured={Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim())} />;
}

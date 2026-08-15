import "server-only";

import { unstable_cache } from "next/cache";

import { buildRoadMapPayload } from "@/lib/road-map";
import { getCameras } from "@/services/cameras";
import { getIrcaData } from "@/services/vegagerdin";
import type { RoadMapPayload } from "@/types/road-map";

const getRoadMapPayloadCached = unstable_cache(async (): Promise<RoadMapPayload> => {
  const [irca, cameras] = await Promise.all([getIrcaData(), getCameras()]);
  return buildRoadMapPayload({
    sections: irca.sections.data,
    conditions: irca.roadConditions.data,
    incidents: irca.incidents.data,
    observations: irca.measurements.data,
    cameras: cameras.data,
    availability: {
      sections: irca.sections.available,
      conditions: irca.roadConditions.available,
      incidents: irca.incidents.available,
      weather: irca.measurements.available,
      cameras: cameras.available,
    },
    updatedAt: latestDate([irca.roadConditions.updatedAt, irca.incidents.updatedAt, irca.measurements.updatedAt, cameras.updatedAt]),
  });
}, ["road-map-payload-v2"], { revalidate: 300 });

export function getRoadMapPayload(): Promise<RoadMapPayload> {
  return getRoadMapPayloadCached();
}

function latestDate(values: Array<string | undefined>): string | undefined {
  return values.filter((value): value is string => Boolean(value) && !Number.isNaN(Date.parse(value as string))).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

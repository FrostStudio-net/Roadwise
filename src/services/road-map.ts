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
    updatedAt: irca.roadConditions.updatedAt,
  });
}, ["road-map-payload-v2"], { revalidate: 300 });

export function getRoadMapPayload(): Promise<RoadMapPayload> {
  return getRoadMapPayloadCached();
}

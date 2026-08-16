import { detectLongServiceGaps, matchServicePoisToRoute } from "@/lib/fuel-services";
import type { GeoJsonLineString } from "@/types/road";
import type { ServicePoi } from "@/types/service-poi";

export type ChargingOutlook = {
  chargerCount: number;
  longestGapKm?: number;
};

export function createChargingOutlook(route: GeoJsonLineString, routeDistanceKm: number, pois: ServicePoi[]): ChargingOutlook {
  const chargers = matchServicePoisToRoute({ route, pois, filter: "ev" });
  const gaps = detectLongServiceGaps({ routeDistanceKm, matchedPois: chargers, type: "ev" });
  const longestGapKm = gaps.reduce<number | undefined>((longest, gap) => longest === undefined || gap.distanceKm > longest ? gap.distanceKm : longest, undefined);
  return { chargerCount: chargers.length, longestGapKm };
}

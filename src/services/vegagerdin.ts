import { unstable_cache } from "next/cache";

import {
  parseIncidents,
  parseMeasuredData,
  parseMeasurementSites,
  parsePredefinedLocations,
  parseRoadConditions,
} from "@/lib/datex-parser";
import { fetchOfficialFeed, unavailableFeed } from "@/services/http";
import type {
  FeedResult,
  IrcaDataset,
  MeasurementSite,
  RoadCondition,
  RoadIncident,
  RoadSection,
  RoadsideMeasurement,
} from "@/types/road";

const DATEX_BASE = "https://datex.vegagerdin.is";
const URLS = {
  roadConditions: `${DATEX_BASE}/situationpublication3_1/RoadConditionService/pullsnapshotdata`,
  incidents: `${DATEX_BASE}/situationpublication3_1/SituationService/pullsnapshotdata`,
  sections: `${DATEX_BASE}/predefinedlocationspublication3_1/PredefinedLocationsPublicationService/pullsnapshotdata`,
  stations: `${DATEX_BASE}/measurementsitetablepublication3_1/MeasurementSiteTablePublicationService/pullsnapshotdata`,
  measurements: `${DATEX_BASE}/measureddatapublication3_1/MeasureDataService/pullsnapshotdata`,
} as const;

const REVALIDATE = { dynamic: 300, definitions: 3_600 } as const;

function feedResult<T>(data: T, parsedAt?: string, headerAt?: string): FeedResult<T> {
  return { available: true, data, updatedAt: parsedAt ?? headerAt };
}

const getSectionsCached = unstable_cache(async (): Promise<FeedResult<RoadSection[]>> => {
  try {
    // The decoded section publication is >2 MB, so cache the compact parsed
    // OpenLR/WGS84 representation instead of asking Next to cache the raw XML.
    const raw = await fetchOfficialFeed(URLS.sections, REVALIDATE.definitions, "application/xml, text/xml", false);
    const parsed = parsePredefinedLocations(raw.text);
    return feedResult(parsed.data, parsed.publicationTime, raw.updatedAt);
  } catch {
    return unavailableFeed([], "IRCA section geometry is unavailable");
  }
}, ["irca-sections-openlr-v1"], { revalidate: REVALIDATE.definitions });

const getRoadConditionsCached = unstable_cache(async (): Promise<FeedResult<RoadCondition[]>> => {
  try {
    const raw = await fetchOfficialFeed(URLS.roadConditions, REVALIDATE.dynamic, "application/xml, text/xml");
    const parsed = parseRoadConditions(raw.text);
    return feedResult(parsed.data, parsed.publicationTime, raw.updatedAt);
  } catch {
    return unavailableFeed([], "IRCA road conditions are unavailable");
  }
}, ["irca-road-conditions-v1"], { revalidate: REVALIDATE.dynamic });

const getIncidentsCached = unstable_cache(async (): Promise<FeedResult<RoadIncident[]>> => {
  try {
    const raw = await fetchOfficialFeed(URLS.incidents, REVALIDATE.dynamic, "application/xml, text/xml");
    const parsed = parseIncidents(raw.text);
    return feedResult(parsed.data, parsed.publicationTime, raw.updatedAt);
  } catch {
    return unavailableFeed([], "IRCA incidents are unavailable");
  }
}, ["irca-incidents-v1"], { revalidate: REVALIDATE.dynamic });

const getMeasurementSitesCached = unstable_cache(async (): Promise<FeedResult<MeasurementSite[]>> => {
  try {
    const raw = await fetchOfficialFeed(URLS.stations, REVALIDATE.definitions, "application/xml, text/xml");
    const parsed = parseMeasurementSites(raw.text);
    return feedResult(parsed.data, parsed.publicationTime, raw.updatedAt);
  } catch {
    return unavailableFeed([], "IRCA measurement sites are unavailable");
  }
}, ["irca-measurement-sites-v1"], { revalidate: REVALIDATE.definitions });

const getMeasurementsCached = unstable_cache(async (): Promise<FeedResult<RoadsideMeasurement[]>> => {
  const sites = await getMeasurementSitesCached();
  if (!sites.available) return unavailableFeed([], "IRCA roadside measurements are unavailable");
  try {
    const raw = await fetchOfficialFeed(URLS.measurements, REVALIDATE.dynamic, "application/xml, text/xml");
    const parsed = parseMeasuredData(raw.text, sites.data);
    return feedResult(parsed.data, parsed.publicationTime, raw.updatedAt);
  } catch {
    return unavailableFeed([], "IRCA roadside measurements are unavailable");
  }
}, ["irca-roadside-measurements-v1"], { revalidate: REVALIDATE.dynamic });

export async function getIrcaData(): Promise<IrcaDataset> {
  const [rawRoadConditions, incidents, sections, measurements] = await Promise.all([
    getRoadConditionsCached(),
    getIncidentsCached(),
    getSectionsCached(),
    getMeasurementsCached(),
  ]);
  const sectionMap = new Map(sections.data.map((section) => [section.id, section]));
  const roadConditions: FeedResult<RoadCondition[]> = {
    ...rawRoadConditions,
    data: rawRoadConditions.data.map((condition) => ({
      ...condition,
      section: condition.locationId ? sectionMap.get(condition.locationId) : undefined,
    })),
  };
  return { roadConditions, incidents, measurements, sections };
}

export async function getMeasurementSites(): Promise<FeedResult<MeasurementSite[]>> {
  return getMeasurementSitesCached();
}

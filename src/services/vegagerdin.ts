import { unstable_cache } from "next/cache";

import {
  parseIncidents,
  parseMeasuredData,
  parseMeasurementSites,
  parsePredefinedLocations,
  parseRoadConditions,
} from "@/lib/datex-parser";
import { developmentError } from "@/lib/server-log";
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
  // The decoded section publication is >2 MB, so cache simplified WGS84
  // geometry instead of asking Next to cache the raw XML response.
  const raw = await fetchOfficialFeed(URLS.sections, REVALIDATE.definitions, "application/xml, text/xml", false);
  const parsed = parsePredefinedLocations(raw.text);
  return feedResult(parsed.data, parsed.publicationTime, raw.updatedAt);
}, ["irca-sections-gml-v3"], { revalidate: REVALIDATE.definitions });

const getRoadConditionsCached = unstable_cache(async (): Promise<FeedResult<RoadCondition[]>> => {
  const raw = await fetchOfficialFeed(URLS.roadConditions, REVALIDATE.dynamic, "application/xml, text/xml");
  const parsed = parseRoadConditions(raw.text);
  return feedResult(parsed.data, parsed.publicationTime, raw.updatedAt);
}, ["irca-road-conditions-v3"], { revalidate: REVALIDATE.dynamic });

const getIncidentsCached = unstable_cache(async (): Promise<FeedResult<RoadIncident[]>> => {
  const raw = await fetchOfficialFeed(URLS.incidents, REVALIDATE.dynamic, "application/xml, text/xml");
  const parsed = parseIncidents(raw.text);
  return feedResult(parsed.data, parsed.publicationTime, raw.updatedAt);
}, ["irca-incidents-v3"], { revalidate: REVALIDATE.dynamic });

const getMeasurementSitesCached = unstable_cache(async (): Promise<FeedResult<MeasurementSite[]>> => {
  const raw = await fetchOfficialFeed(URLS.stations, REVALIDATE.definitions, "application/xml, text/xml");
  const parsed = parseMeasurementSites(raw.text);
  return feedResult(parsed.data, parsed.publicationTime, raw.updatedAt);
}, ["irca-measurement-sites-v2"], { revalidate: REVALIDATE.definitions });

const getMeasurementsCached = unstable_cache(async (): Promise<FeedResult<RoadsideMeasurement[]>> => {
  const sites = await getMeasurementSitesCached();
  const raw = await fetchOfficialFeed(URLS.measurements, REVALIDATE.dynamic, "application/xml, text/xml");
  const parsed = parseMeasuredData(raw.text, sites.data);
  return feedResult(parsed.data, parsed.publicationTime, raw.updatedAt);
}, ["irca-roadside-measurements-v2"], { revalidate: REVALIDATE.dynamic });

async function safeFeed<T>(
  stage: string,
  load: () => Promise<FeedResult<T>>,
  fallback: T,
  message: string,
): Promise<FeedResult<T>> {
  try {
    return await load();
  } catch (error) {
    developmentError(`irca:${stage}`, error);
    return unavailableFeed(fallback, message);
  }
}

export async function getIrcaData(): Promise<IrcaDataset> {
  const [rawRoadConditions, incidents, sections, measurements] = await Promise.all([
    safeFeed("road-conditions", getRoadConditionsCached, [], "IRCA road conditions are unavailable"),
    safeFeed("incidents", getIncidentsCached, [], "IRCA incidents are unavailable"),
    safeFeed("section-geometry", getSectionsCached, [], "IRCA section geometry is unavailable"),
    safeFeed("measurements", getMeasurementsCached, [], "IRCA roadside measurements are unavailable"),
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
  return safeFeed("measurement-sites", getMeasurementSitesCached, [], "IRCA measurement sites are unavailable");
}

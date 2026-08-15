import { unstable_cache } from "next/cache";

import {
  parseIncidents,
  parseMeasuredData,
  parseMeasurementSites,
  parsePredefinedLocations,
  parseRoadConditions,
} from "@/lib/datex-parser";
import {
  markIrcaCacheMiss,
  markIrcaPartialFallback,
  measureServerTiming,
  measureServerTimingSync,
} from "@/lib/analysis-timing";
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

const REVALIDATE = { snapshot: 300, dynamic: 300, definitions: 3_600 } as const;

function feedResult<T>(data: T, parsedAt?: string, headerAt?: string): FeedResult<T> {
  return { available: true, data, updatedAt: parsedAt ?? headerAt };
}

const getSectionsCached = unstable_cache(async (): Promise<FeedResult<RoadSection[]>> => {
  // Cache simplified WGS84 geometry, not the multi-megabyte XML publication.
  const raw = await measureServerTiming(
    "ircaSectionsFetchMs",
    () => fetchOfficialFeed(URLS.sections, REVALIDATE.definitions, "application/xml, text/xml", false),
  );
  const parsed = measureServerTimingSync("datexParsingMs", () => parsePredefinedLocations(raw.text));
  return feedResult(parsed.data, parsed.publicationTime, raw.updatedAt);
}, ["irca-sections-gml-v4"], { revalidate: REVALIDATE.definitions });

const getRoadConditionsCached = unstable_cache(async (): Promise<FeedResult<RoadCondition[]>> => {
  const raw = await measureServerTiming(
    "ircaRoadConditionsFetchMs",
    () => fetchOfficialFeed(URLS.roadConditions, REVALIDATE.dynamic, "application/xml, text/xml"),
  );
  const parsed = measureServerTimingSync("datexParsingMs", () => parseRoadConditions(raw.text));
  return feedResult(parsed.data, parsed.publicationTime, raw.updatedAt);
}, ["irca-road-conditions-v4"], { revalidate: REVALIDATE.dynamic });

const getIncidentsCached = unstable_cache(async (): Promise<FeedResult<RoadIncident[]>> => {
  const raw = await measureServerTiming(
    "ircaIncidentsFetchMs",
    () => fetchOfficialFeed(URLS.incidents, REVALIDATE.dynamic, "application/xml, text/xml"),
  );
  const parsed = measureServerTimingSync("datexParsingMs", () => parseIncidents(raw.text));
  return feedResult(parsed.data, parsed.publicationTime, raw.updatedAt);
}, ["irca-incidents-v4"], { revalidate: REVALIDATE.dynamic });

const getMeasurementSitesCached = unstable_cache(async (): Promise<FeedResult<MeasurementSite[]>> => {
  const raw = await measureServerTiming(
    "ircaStationsFetchMs",
    () => fetchOfficialFeed(URLS.stations, REVALIDATE.definitions, "application/xml, text/xml"),
  );
  const parsed = measureServerTimingSync("datexParsingMs", () => parseMeasurementSites(raw.text));
  return feedResult(parsed.data, parsed.publicationTime, raw.updatedAt);
}, ["irca-measurement-sites-v3"], { revalidate: REVALIDATE.definitions });

const getMeasurementsCached = unstable_cache(async (): Promise<FeedResult<RoadsideMeasurement[]>> => {
  const [sites, raw] = await Promise.all([
    getMeasurementSitesCached(),
    measureServerTiming(
      "ircaMeasurementsFetchMs",
      () => fetchOfficialFeed(URLS.measurements, REVALIDATE.dynamic, "application/xml, text/xml"),
    ),
  ]);
  const parsed = measureServerTimingSync("datexParsingMs", () => parseMeasuredData(raw.text, sites.data));
  return feedResult(parsed.data, parsed.publicationTime, raw.updatedAt);
}, ["irca-roadside-measurements-v3"], { revalidate: REVALIDATE.dynamic });

function joinSnapshot(
  rawRoadConditions: FeedResult<RoadCondition[]>,
  incidents: FeedResult<RoadIncident[]>,
  sections: FeedResult<RoadSection[]>,
  measurements: FeedResult<RoadsideMeasurement[]>,
): IrcaDataset {
  const sectionMap = new Map(sections.data.map((section) => [section.id, section]));
  const roadConditions: FeedResult<RoadCondition[]> = {
    ...rawRoadConditions,
    data: rawRoadConditions.data.map((condition) => ({
      ...condition,
      section: condition.locationId ? sectionMap.get(condition.locationId) : undefined,
    })),
  };
  return { snapshotId: crypto.randomUUID(), roadConditions, incidents, measurements, sections };
}

async function buildSnapshot(): Promise<IrcaDataset> {
  const [roadConditions, incidents, sections, measurements] = await Promise.all([
    getRoadConditionsCached(),
    getIncidentsCached(),
    getSectionsCached(),
    getMeasurementsCached(),
  ]);
  return joinSnapshot(roadConditions, incidents, sections, measurements);
}

let warmSnapshot: { data: IrcaDataset; expiresAt: number } | undefined;
let pendingSnapshot: Promise<IrcaDataset> | undefined;

function getWarmSnapshot(): Promise<IrcaDataset> {
  if (warmSnapshot && warmSnapshot.expiresAt > Date.now()) return Promise.resolve(warmSnapshot.data);
  if (pendingSnapshot) return pendingSnapshot;
  markIrcaCacheMiss();
  pendingSnapshot = buildSnapshot()
    .then((data) => {
      warmSnapshot = { data, expiresAt: Date.now() + REVALIDATE.snapshot * 1_000 };
      return data;
    })
    .finally(() => {
      pendingSnapshot = undefined;
    });
  return pendingSnapshot;
}

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

async function partialSnapshotAfterFailure(): Promise<IrcaDataset> {
  markIrcaPartialFallback();
  const [roadConditions, incidents, sections, measurements] = await Promise.all([
    safeFeed("road-conditions", getRoadConditionsCached, [], "IRCA road conditions are unavailable"),
    safeFeed("incidents", getIncidentsCached, [], "IRCA incidents are unavailable"),
    safeFeed("section-geometry", getSectionsCached, [], "IRCA section geometry is unavailable"),
    safeFeed("measurements", getMeasurementsCached, [], "IRCA roadside measurements are unavailable"),
  ]);
  return joinSnapshot(roadConditions, incidents, sections, measurements);
}

export async function getIrcaData(): Promise<IrcaDataset> {
  return measureServerTiming("ircaCacheLookupMs", async () => {
    try {
      return await getWarmSnapshot();
    } catch (error) {
      developmentError("irca:snapshot", error);
      return partialSnapshotAfterFailure();
    }
  });
}

export async function getMeasurementSites(): Promise<FeedResult<MeasurementSite[]>> {
  return safeFeed("measurement-sites", getMeasurementSitesCached, [], "IRCA measurement sites are unavailable");
}

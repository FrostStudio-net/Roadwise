import { XMLParser } from "fast-xml-parser";

import type {
  Coordinates,
  IncidentType,
  MeasurementSite,
  MeasurementValues,
  RoadCondition,
  RoadConditionState,
  RoadIncident,
  RoadSection,
  RoadsideMeasurement,
} from "@/types/road";

type UnknownRecord = Record<string, unknown>;

export type ParsedPublication<T> = {
  publicationTime?: string;
  data: T;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  attributeNamePrefix: "@_",
  parseTagValue: true,
  trimValues: true,
});

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const record = asRecord(value);
  return record ? asString(record["#text"]) : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  const record = asRecord(value);
  return record ? asNumber(record["#text"]) : undefined;
}

function getPath(value: unknown, ...path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

function payloadFromXml(xml: string): UnknownRecord {
  const parsed: unknown = parser.parse(xml);
  const payload = asRecord(getPath(parsed, "messageContainer", "payload"));
  if (!payload) throw new Error("DATEX payload is missing or malformed");
  return payload;
}

function normalizeToken(value: unknown): string {
  return (asString(value) ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function validIsoDate(value: unknown): string | undefined {
  const text = asString(value);
  return text && !Number.isNaN(Date.parse(text)) ? text : undefined;
}

type LocalizedValue = { text: string; language?: string };

function collectLocalizedValues(value: unknown, output: LocalizedValue[] = []): LocalizedValue[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectLocalizedValues(item, output));
    return output;
  }
  const record = asRecord(value);
  if (!record) return output;
  if ("#text" in record) {
    const text = asString(record["#text"]);
    if (text) output.push({ text, language: asString(record["@_lang"]) });
  }
  Object.values(record).forEach((item) => collectLocalizedValues(item, output));
  return output;
}

function localizedText(value: unknown): string | undefined {
  const values = collectLocalizedValues(value);
  return values.find((item) => item.language === "en")?.text
    ?? values.find((item) => item.language === "is")?.text
    ?? values[0]?.text;
}

function validity(record: UnknownRecord): { validFrom?: string; validTo?: string } {
  const spec = getPath(record, "validity", "validityTimeSpecification");
  return {
    validFrom: validIsoDate(getPath(spec, "overallStartTime")),
    validTo: validIsoDate(getPath(spec, "overallEndTime")),
  };
}

const roadStateMap: Record<string, RoadConditionState> = {
  normal: "normal",
  normaldrivingconditions: "normal",
  slippery: "slippery",
  slipperysurface: "slippery",
  icypatches: "icyPatches",
  ice: "icyPatches",
  snow: "snow",
  snowonroad: "snow",
  hazardous: "hazardous",
  hazardousdrivingconditions: "hazardous",
  passablewithcare: "passableWithCare",
  slushonroad: "slushOnRoad",
  roadclosed: "roadClosed",
  closedpermanentlyforthewinter: "closedPermanentlyForWinter",
  closedpermanentlyforwinter: "closedPermanentlyForWinter",
  snowfall: "snowfall",
  badweather: "badWeather",
  blowingdust: "blowingDust",
  blowingsnow: "blowingSnow",
  blizzard: "blizzard",
  fog: "fog",
  loosechippings: "looseChippings",
};

function roadConditionState(record: UnknownRecord): RoadConditionState {
  const candidateKeys = [
    "roadOrCarriagewayOrLaneManagementType",
    "drivingConditionType",
    "nonWeatherRelatedRoadConditionType",
    "poorEnvironmentType",
    "weatherRelatedRoadConditionType",
    "winterDrivingManagementType",
  ];
  for (const key of candidateKeys) {
    const state = roadStateMap[normalizeToken(record[key])];
    if (state) return state;
  }
  return "unknown";
}

function publication<T>(payload: UnknownRecord, data: T): ParsedPublication<T> {
  return { publicationTime: validIsoDate(payload.publicationTime), data };
}

export function parseRoadConditions(xml: string): ParsedPublication<RoadCondition[]> {
  const payload = payloadFromXml(xml);
  const data: RoadCondition[] = [];
  for (const situationValue of asArray(payload.situation)) {
    const situation = asRecord(situationValue);
    if (!situation) continue;
    for (const recordValue of asArray(situation.situationRecord)) {
      const record = asRecord(recordValue);
      if (!record) continue;
      const id = asString(record["@_id"]) ?? asString(situation["@_id"]);
      if (!id) continue;
      const dates = validity(record);
      data.push({
        id,
        state: roadConditionState(record),
        description: localizedText(record.generalPublicComment),
        locationId: asString(getPath(record, "locationReference", "predefinedLocationReference", "@_id")),
        ...dates,
        updatedAt: validIsoDate(record.situationRecordVersionTime),
      });
    }
  }
  return publication(payload, data);
}

const incidentMap: Record<string, IncidentType> = {
  roadclosed: "roadClosed",
  roadworks: "roadworks",
  roadsurfaceinpoorcondition: "roadSurfaceInPoorCondition",
  loosechippings: "looseChippings",
  flooding: "flooding",
  avalanche: "avalanches",
  avalanches: "avalanches",
  rockfall: "rockfalls",
  rockfalls: "rockfalls",
  animalsontheroad: "animalsOnTheRoad",
  strongwinds: "strongWinds",
  accident: "accident",
  obstructionontheroad: "obstructionOnTheRoad",
  other: "obstructionOnTheRoad",
};

function incidentType(record: UnknownRecord): IncidentType {
  const candidateKeys = [
    "roadOrCarriagewayOrLaneManagementType",
    "roadMaintenanceType",
    "nonWeatherRelatedRoadConditionType",
    "obstructionType",
    "environmentalObstructionType",
    "accidentType",
  ];
  for (const key of candidateKeys) {
    const type = incidentMap[normalizeToken(record[key])];
    if (type) return type;
  }
  const datexClass = normalizeToken(record["@_type"]);
  if (datexClass.includes("accident")) return "accident";
  if (datexClass.includes("obstruction")) return "obstructionOnTheRoad";
  return "unknown";
}

function coordinatesFrom(value: unknown): Coordinates | undefined {
  const latitude = asNumber(getPath(value, "latitude"));
  const longitude = asNumber(getPath(value, "longitude"));
  return latitude !== undefined && longitude !== undefined
    ? [longitude, latitude]
    : undefined;
}

function incidentCoordinates(record: UnknownRecord): Coordinates | undefined {
  const location = getPath(record, "locationReference");
  return coordinatesFrom(getPath(location, "coordinatesForDisplay"))
    ?? coordinatesFrom(getPath(location, "pointByCoordinates", "pointCoordinates"))
    ?? coordinatesFrom(getPath(location, "openlrPointLocationReference", "openlrCoordinates"));
}

function titleForIncident(type: IncidentType): string {
  const titles: Record<IncidentType, string> = {
    roadClosed: "Road closed",
    roadworks: "Roadworks",
    roadSurfaceInPoorCondition: "Poor road surface",
    looseChippings: "Loose chippings",
    flooding: "Flooding",
    avalanches: "Avalanche hazard",
    rockfalls: "Rockfall hazard",
    animalsOnTheRoad: "Animals on the road",
    strongWinds: "Strong winds",
    accident: "Accident",
    obstructionOnTheRoad: "Obstruction on the road",
    unknown: "Road incident",
  };
  return titles[type];
}

export function parseIncidents(xml: string): ParsedPublication<RoadIncident[]> {
  const payload = payloadFromXml(xml);
  const data: RoadIncident[] = [];
  for (const situationValue of asArray(payload.situation)) {
    const situation = asRecord(situationValue);
    if (!situation) continue;
    for (const recordValue of asArray(situation.situationRecord)) {
      const record = asRecord(recordValue);
      if (!record) continue;
      const id = asString(record["@_id"]) ?? asString(situation["@_id"]);
      if (!id) continue;
      const type = incidentType(record);
      const dates = validity(record);
      data.push({
        id,
        type,
        title: titleForIncident(type),
        description: localizedText(record.generalPublicComment),
        coordinates: incidentCoordinates(record),
        ...dates,
        updatedAt: validIsoDate(record.situationRecordVersionTime),
      });
    }
  }
  return publication(payload, data);
}

function openLrCoordinates(linearLocation: unknown): Coordinates[] {
  const firstDirection = getPath(linearLocation, "openlrLinear", "firstDirection");
  const points = asArray(getPath(firstDirection, "openlrLocationReferencePoint"))
    .map((point) => coordinatesFrom(getPath(point, "openlrCoordinates")))
    .filter((point): point is Coordinates => Boolean(point));
  const last = coordinatesFrom(getPath(firstDirection, "openlrLastLocationReferencePoint", "openlrCoordinates"));
  if (last) points.push(last);
  return points;
}

function roadNumberFrom(location: unknown): string | undefined {
  return asString(getPath(location, "supplementaryPositionalDescription", "roadInformation", "roadNumber"));
}

export function parsePredefinedLocations(xml: string): ParsedPublication<RoadSection[]> {
  const payload = payloadFromXml(xml);
  const data: RoadSection[] = [];
  for (const referenceValue of asArray(payload.predefinedLocationReference)) {
    const reference = asRecord(referenceValue);
    if (!reference) continue;
    const id = asString(reference["@_id"]);
    if (!id) continue;
    const isGroup = normalizeToken(reference["@_type"]).endsWith("predefinedlocationgroup");
    const locations = isGroup
      ? asArray(getPath(reference, "locationGroup", "locationContainedInGroup"))
      : asArray(reference.location);
    const lines = locations
      .map(openLrCoordinates)
      .filter((coordinates) => coordinates.length >= 2);
    const roadNumbers = [...new Set(locations.map(roadNumberFrom).filter((value): value is string => Boolean(value)))];
    const name = localizedText(reference.predefinedLocationName)
      ?? localizedText(reference.predefinedLocationGroupName)
      ?? localizedText(getPath(locations[0], "supplementaryPositionalDescription", "locationDescription"));
    data.push({
      id,
      name,
      roadNumbers,
      geometry: lines.length === 1
        ? { type: "LineString", coordinates: lines[0] }
        : lines.length > 1
          ? { type: "MultiLineString", coordinates: lines }
          : undefined,
    });
  }
  return publication(payload, data);
}

export function parseMeasurementSites(xml: string): ParsedPublication<MeasurementSite[]> {
  const payload = payloadFromXml(xml);
  const data: MeasurementSite[] = [];
  for (const siteValue of asArray(getPath(payload, "measurementSiteTable", "measurementSite"))) {
    const site = asRecord(siteValue);
    if (!site) continue;
    const id = asString(site["@_id"]);
    const coordinates = coordinatesFrom(getPath(site, "measurementSiteLocation", "coordinatesForDisplay"))
      ?? coordinatesFrom(getPath(site, "measurementSiteLocation", "pointByCoordinates", "pointCoordinates"));
    if (!id || !coordinates) continue;
    const measurementTypes = asArray(site.measurementSpecificCharacteristics)
      .map((characteristic) => asString(getPath(characteristic, "measurementSpecificCharacteristics", "specificMeasurementValueType")))
      .filter((value): value is string => Boolean(value));
    data.push({
      id,
      externalId: asString(site.measurementSiteIdentification),
      name: localizedText(site.measurementSiteName) ?? id,
      coordinates,
      measurementTypes: [...new Set(measurementTypes)],
    });
  }
  return publication(payload, data);
}

function findNumberByKey(value: unknown, wantedKeys: string[]): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNumberByKey(item, wantedKeys);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  for (const key of wantedKeys) {
    const found = asNumber(record[key]);
    if (found !== undefined) return found;
  }
  for (const child of Object.values(record)) {
    const found = findNumberByKey(child, wantedKeys);
    if (found !== undefined) return found;
  }
  return undefined;
}

function measurementValues(quantities: unknown): MeasurementValues {
  const values: MeasurementValues = {};
  for (const quantity of asArray(quantities)) {
    const basicData = getPath(quantity, "physicalQuantity", "basicData");
    const type = normalizeToken(getPath(basicData, "@_type"));
    if (type.includes("windinformation")) {
      values.windDirectionDegrees ??= findNumberByKey(basicData, ["directionBearing"]);
      values.windDirectionCompass ??= asString(getPath(basicData, "wind", "windDirectionCompass", "directionCompass"));
      const maximum = findNumberByKey(getPath(basicData, "wind", "maximumWindSpeed"), ["windSpeed"]);
      const speed = findNumberByKey(getPath(basicData, "wind", "windSpeed"), ["windSpeed"]);
      if (maximum !== undefined) values.maximumWindSpeedMps = maximum;
      else if (speed !== undefined) values.windSpeedMps = speed;
    } else if (type.includes("temperatureinformation")) {
      values.airTemperatureC ??= findNumberByKey(getPath(basicData, "temperature", "airTemperature"), ["temperature"]);
      values.dewPointC ??= findNumberByKey(getPath(basicData, "temperature", "dewPointTemperature"), ["temperature"]);
    } else if (type.includes("roadsurfaceconditioninformation")) {
      values.roadSurfaceTemperatureC ??= findNumberByKey(getPath(basicData, "roadSurfaceConditionMeasurements", "roadSurfaceTemperature"), ["temperature"]);
    } else if (type.includes("humidityinformation")) {
      values.relativeHumidityPercent ??= findNumberByKey(basicData, ["percentage"]);
    } else if (type.includes("pressureinformation")) {
      values.pressureHpa ??= findNumberByKey(basicData, ["pressure", "atmosphericPressure"]);
    } else if (type.includes("trafficflow")) {
      values.trafficFlowVehiclesPerHour ??= findNumberByKey(getPath(basicData, "vehicleFlow"), ["vehicleFlowRate"]);
      values.trafficFlowVehiclesPer10Minutes ??= findNumberByKey(getPath(basicData, "_trafficFlowExtension", "trafficFlowExtension", "vehicleFlowPer10Minute"), ["vehicleFlowRate"]);
      values.trafficFlowVehiclesPerDay ??= findNumberByKey(getPath(basicData, "_trafficFlowExtension", "trafficFlowExtension", "vehicleFlowPerDay"), ["vehicleFlowRate"]);
    }
  }
  return values;
}

export function parseMeasuredData(xml: string, sites: MeasurementSite[]): ParsedPublication<RoadsideMeasurement[]> {
  const payload = payloadFromXml(xml);
  const siteMap = new Map(sites.map((site) => [site.id, site]));
  const data: RoadsideMeasurement[] = [];
  for (const measurementsValue of asArray(payload.siteMeasurements)) {
    const measurements = asRecord(measurementsValue);
    if (!measurements) continue;
    const siteId = asString(getPath(measurements, "measurementSiteReference", "@_id"));
    const site = siteId ? siteMap.get(siteId) : undefined;
    if (!site) continue;
    data.push({
      ...site,
      observedAt: validIsoDate(getPath(measurements, "measurementTimeDefault", "timeValue")),
      values: measurementValues(measurements.physicalQuantity),
    });
  }
  return publication(payload, data);
}

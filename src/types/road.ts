export type Coordinates = [longitude: number, latitude: number];

export type GeoJsonLineString = {
  type: "LineString";
  coordinates: Coordinates[];
};

export type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: Coordinates[][];
};

export type GeoJsonMultiLineString = {
  type: "MultiLineString";
  coordinates: Coordinates[][];
};

export type RoadConditionState =
  | "normal"
  | "slippery"
  | "icyPatches"
  | "snow"
  | "hazardous"
  | "passableWithCare"
  | "slushOnRoad"
  | "roadClosed"
  | "closedPermanentlyForWinter"
  | "snowfall"
  | "badWeather"
  | "blowingDust"
  | "blowingSnow"
  | "blizzard"
  | "fog"
  | "looseChippings"
  | "unknown";

export type IncidentType =
  | "roadClosed"
  | "roadworks"
  | "roadSurfaceInPoorCondition"
  | "looseChippings"
  | "flooding"
  | "avalanches"
  | "rockfalls"
  | "animalsOnTheRoad"
  | "strongWinds"
  | "accident"
  | "obstructionOnTheRoad"
  | "unknown";

export type RoadSection = {
  id: string;
  name?: string;
  roadNumbers: string[];
  geometry?: GeoJsonLineString | GeoJsonMultiLineString;
};

export type RoadCondition = {
  id: string;
  state: RoadConditionState;
  description?: string;
  locationId?: string;
  section?: RoadSection;
  validFrom?: string;
  validTo?: string;
  updatedAt?: string;
};

export type RoadIncident = {
  id: string;
  type: IncidentType;
  title: string;
  description?: string;
  coordinates?: Coordinates;
  validFrom?: string;
  validTo?: string;
  updatedAt?: string;
  distanceAheadKm?: number;
};

export type MeasurementValues = {
  windDirectionDegrees?: number;
  windDirectionCompass?: string;
  windSpeedMps?: number;
  maximumWindSpeedMps?: number;
  airTemperatureC?: number;
  roadSurfaceTemperatureC?: number;
  dewPointC?: number;
  pressureHpa?: number;
  relativeHumidityPercent?: number;
  trafficFlowVehiclesPerHour?: number;
  trafficFlowVehiclesPer10Minutes?: number;
  trafficFlowVehiclesPerDay?: number;
};

export type MeasurementSite = {
  id: string;
  externalId?: string;
  name: string;
  coordinates: Coordinates;
  measurementTypes: string[];
};

export type RoadsideMeasurement = MeasurementSite & {
  observedAt?: string;
  distanceAheadKm?: number;
  values: MeasurementValues;
};

export type Camera = {
  id: string;
  name: string;
  roadName?: string;
  roadNumber?: string;
  description?: string;
  coordinates: Coordinates;
  imageUrl: string;
};

export type ImoWarning = {
  identifier: string;
  severity?: string;
  status?: string;
  title: string;
  event?: string;
  description?: string;
  effectiveAt?: string;
  expiresAt?: string;
  sentAt?: string;
  areaId?: number;
  areaDescription?: string;
  polygons: GeoJsonPolygon[];
};

export type FeedResult<T> = {
  available: boolean;
  data: T;
  updatedAt?: string;
  error?: string;
};

export type IrcaDataset = {
  roadConditions: FeedResult<RoadCondition[]>;
  incidents: FeedResult<RoadIncident[]>;
  measurements: FeedResult<RoadsideMeasurement[]>;
  sections: FeedResult<RoadSection[]>;
};

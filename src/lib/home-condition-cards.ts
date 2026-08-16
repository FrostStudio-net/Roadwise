import type { ConditionTone } from "@/components/ConditionCard";
import type { CurrentLocationStatus } from "@/hooks/use-current-location";
import type { AnalyseRouteResponse, RiskLevel, WarningSeverity } from "@/types/analysis";
import type { NearbyConditionsResponse } from "@/types/nearby";

export type HomeConditionCard = {
  value: string;
  note: "Nearby" | "On your route";
  tone: ConditionTone;
};

export type HomeConditionCards = {
  wind: HomeConditionCard;
  roads: HomeConditionCard;
  advisories: HomeConditionCard;
};

export function resolveHomeConditionCards(input: {
  route?: AnalyseRouteResponse;
  nearby?: NearbyConditionsResponse;
  locationStatus: CurrentLocationStatus;
  nearbyLoading: boolean;
  nearbyUnavailable?: boolean;
}): HomeConditionCards {
  if (input.route) return routeConditionCards(input.route);
  if (input.nearby) return nearbyConditionCards(input.nearby);
  if (input.nearbyUnavailable) return unavailableConditionCards();
  return inactiveConditionCards(input.locationStatus, input.nearbyLoading);
}

export function routeConditionCards(route: AnalyseRouteResponse): HomeConditionCards {
  const windWarning = route.analysis.warnings.find((warning) => warning.type === "strongWinds");
  const advisories = route.analysis.warnings.filter((warning) => warning.id.startsWith("incident-") || warning.id.startsWith("imo-"));
  const advisorySourcesAvailable = route.sources.irca.incidents && route.sources.imo.available;
  return {
    wind: windWarning
      ? { value: windWarning.severity === "difficult" || windWarning.severity === "closed" ? "Strong wind" : "Elevated wind", note: "On your route", tone: severityTone(windWarning.severity) }
      : route.sources.irca.measurements && route.matches.roadsideStations > 0
        ? { value: "No wind warning", note: "On your route", tone: "good" }
        : { value: route.sources.irca.measurements ? "No route reading" : "Unavailable", note: "On your route", tone: "neutral" },
    roads: {
      value: routeStatusLabel(route.analysis.level),
      note: "On your route",
      tone: riskTone(route.analysis.level),
    },
    advisories: advisories.length > 0
      ? { value: `${advisories.length} reported`, note: "On your route", tone: severityTone(highestSeverity(advisories.map((warning) => warning.severity))) }
      : { value: advisorySourcesAvailable ? "None reported" : "Unavailable", note: "On your route", tone: advisorySourcesAvailable ? "good" : "neutral" },
  };
}

export function nearbyConditionCards(nearby: NearbyConditionsResponse): HomeConditionCards {
  return {
    wind: nearby.wind.available && nearby.wind.speedMps !== undefined
      ? { value: `${formatWind(nearby.wind.speedMps)} m/s`, note: "Nearby", tone: riskTone(nearby.wind.status === "unknown" ? "normal" : nearby.wind.status) }
      : { value: "No nearby reading", note: "Nearby", tone: "neutral" },
    roads: nearbyRoadCard(nearby),
    advisories: !nearby.advisories.available
      ? { value: "Unavailable", note: "Nearby", tone: "neutral" }
      : nearby.advisories.count === 0
        ? { value: "None nearby", note: "Nearby", tone: "good" }
        : { value: advisoryCountLabel(nearby.advisories.count), note: "Nearby", tone: riskTone(nearby.advisories.status === "unknown" ? "caution" : nearby.advisories.status) },
  };
}

function inactiveConditionCards(status: CurrentLocationStatus, loading: boolean): HomeConditionCards {
  const checking = loading || status === "checking-permission" || status === "requesting";
  const value = checking ? "Checking nearby…" : "Location off";
  return {
    wind: { value, note: "Nearby", tone: "neutral" },
    roads: { value, note: "Nearby", tone: "neutral" },
    advisories: { value, note: "Nearby", tone: "neutral" },
  };
}

function unavailableConditionCards(): HomeConditionCards {
  return {
    wind: { value: "No nearby reading", note: "Nearby", tone: "neutral" },
    roads: { value: "Unavailable", note: "Nearby", tone: "neutral" },
    advisories: { value: "Unavailable", note: "Nearby", tone: "neutral" },
  };
}

function nearbyRoadCard(nearby: NearbyConditionsResponse): HomeConditionCard {
  if (!nearby.roads.available) return { value: "Unavailable", note: "Nearby", tone: "neutral" };
  if (nearby.roads.matchedRecords === 0) return { value: "No nearby record", note: "Nearby", tone: "neutral" };
  if (nearby.roads.status === "closed") return { value: "Closure nearby", note: "Nearby", tone: "closed" };
  if (nearby.roads.status === "difficult") return { value: "Difficult nearby", note: "Nearby", tone: "difficult" };
  if (nearby.roads.status === "caution") return { value: `${nearby.roads.attentionRecords} caution${nearby.roads.attentionRecords === 1 ? "" : "s"} nearby`, note: "Nearby", tone: "caution" };
  if (nearby.roads.status === "normal") return { value: "Normal nearby", note: "Nearby", tone: "good" };
  return { value: "Unknown nearby", note: "Nearby", tone: "neutral" };
}

function routeStatusLabel(level: RiskLevel): string {
  return { normal: "Normal reported", caution: "Use caution", difficult: "Difficult", closed: "Road closed" }[level];
}

function advisoryCountLabel(count: number): string {
  return `${count} nearby`;
}

function formatWind(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function riskTone(level: RiskLevel): ConditionTone {
  return level === "normal" ? "good" : level;
}

function severityTone(severity: WarningSeverity): ConditionTone {
  return severity === "info" ? "good" : severity;
}

function highestSeverity(values: WarningSeverity[]): WarningSeverity {
  const rank: Record<WarningSeverity, number> = { info: 0, caution: 1, difficult: 2, closed: 3 };
  return [...values].sort((a, b) => rank[b] - rank[a])[0] ?? "info";
}

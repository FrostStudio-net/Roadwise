import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import type { RouteAnalysisTimings, RouteTimingStage } from "@/types/analysis";

const timingStorage = new AsyncLocalStorage<RouteTimingCollector>();

function milliseconds(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

export class RouteTimingCollector {
  private readonly values: Partial<Record<RouteTimingStage, number>> = {};
  private cacheStatus: RouteAnalysisTimings["ircaCacheStatus"] = "hit";

  constructor(readonly requestId: string) {}

  async measure<T>(stage: RouteTimingStage, action: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      return await action();
    } finally {
      this.add(stage, milliseconds(startedAt));
    }
  }

  measureSync<T>(stage: RouteTimingStage, action: () => T): T {
    const startedAt = performance.now();
    try {
      return action();
    } finally {
      this.add(stage, milliseconds(startedAt));
    }
  }

  markIrcaCacheMiss(): void {
    this.cacheStatus = "miss";
  }

  markIrcaPartialFallback(): void {
    this.cacheStatus = "partial-fallback";
  }

  snapshot(totalMs: number): RouteAnalysisTimings {
    return {
      requestId: this.requestId,
      originResolutionMs: this.value("originResolutionMs"),
      destinationResolutionMs: this.value("destinationResolutionMs"),
      mapboxDirectionsMs: this.value("mapboxDirectionsMs"),
      ircaCacheLookupMs: this.value("ircaCacheLookupMs"),
      ircaRoadConditionsFetchMs: this.value("ircaRoadConditionsFetchMs"),
      ircaIncidentsFetchMs: this.value("ircaIncidentsFetchMs"),
      ircaSectionsFetchMs: this.value("ircaSectionsFetchMs"),
      ircaStationsFetchMs: this.value("ircaStationsFetchMs"),
      ircaMeasurementsFetchMs: this.value("ircaMeasurementsFetchMs"),
      datexParsingMs: this.value("datexParsingMs"),
      routeSpatialMatchingMs: this.value("routeSpatialMatchingMs"),
      imoWarningsMs: this.value("imoWarningsMs"),
      riskEngineMs: this.value("riskEngineMs"),
      totalMs: Math.round(totalMs * 10) / 10,
      ircaCacheStatus: this.cacheStatus,
    };
  }

  private add(stage: RouteTimingStage, durationMs: number): void {
    this.values[stage] = (this.values[stage] ?? 0) + durationMs;
  }

  private value(stage: RouteTimingStage): number {
    return Math.round((this.values[stage] ?? 0) * 10) / 10;
  }
}

export function withRouteTiming<T>(collector: RouteTimingCollector, action: () => Promise<T>): Promise<T> {
  return timingStorage.run(collector, action);
}

export async function measureServerTiming<T>(stage: RouteTimingStage, action: () => Promise<T>): Promise<T> {
  const collector = timingStorage.getStore();
  return collector ? collector.measure(stage, action) : action();
}

export function measureServerTimingSync<T>(stage: RouteTimingStage, action: () => T): T {
  const collector = timingStorage.getStore();
  return collector ? collector.measureSync(stage, action) : action();
}

export function markIrcaCacheMiss(): void {
  timingStorage.getStore()?.markIrcaCacheMiss();
}

export function markIrcaPartialFallback(): void {
  timingStorage.getStore()?.markIrcaPartialFallback();
}

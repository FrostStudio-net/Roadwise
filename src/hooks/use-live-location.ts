"use client";

import distance from "@turf/distance";
import { point } from "@turf/helpers";
import { useCallback, useEffect, useRef, useState } from "react";

import { ROUTE_PROGRESS_CONFIG } from "@/lib/route-progress";
import type { Coordinates } from "@/types/road";

export type LiveLocation = {
  coordinates: Coordinates;
  accuracyMeters: number;
  speedKmh?: number;
  speedSource?: "gps" | "derived";
  headingDegrees?: number;
  timestamp: number;
};

export type LiveLocationStatus = "idle" | "requesting" | "active" | "denied" | "unavailable" | "error";

type AccurateSample = { coordinates: Coordinates; timestamp: number };

export function useLiveLocation() {
  const [status, setStatus] = useState<LiveLocationStatus>("idle");
  const [location, setLocation] = useState<LiveLocation>();
  const watchId = useRef<number | undefined>(undefined);
  const previousSample = useRef<AccurateSample | undefined>(undefined);

  const stop = useCallback(() => {
    if (watchId.current !== undefined && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = undefined;
    previousSample.current = undefined;
    setStatus("idle");
    setLocation(undefined);
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    if (watchId.current !== undefined) return;
    setStatus("requesting");
    watchId.current = navigator.geolocation.watchPosition((position) => {
      const coordinates: Coordinates = [position.coords.longitude, position.coords.latitude];
      const accurate = position.coords.accuracy <= ROUTE_PROGRESS_CONFIG.gpsAccuracyThresholdMeters;
      let speedKmh: number | undefined;
      let speedSource: LiveLocation["speedSource"];
      if (accurate && position.coords.speed !== null && position.coords.speed >= 0) {
        speedKmh = position.coords.speed * 3.6;
        speedSource = "gps";
      } else if (accurate && previousSample.current) {
        const elapsedSeconds = (position.timestamp - previousSample.current.timestamp) / 1_000;
        if (elapsedSeconds >= 1 && elapsedSeconds <= 30) {
          const derived = distance(point(previousSample.current.coordinates), point(coordinates), { units: "kilometers" }) / elapsedSeconds * 3_600;
          if (derived >= 0 && derived <= 200) {
            speedKmh = derived;
            speedSource = "derived";
          }
        }
      }
      if (accurate) previousSample.current = { coordinates, timestamp: position.timestamp };
      setLocation({
        coordinates,
        accuracyMeters: position.coords.accuracy,
        speedKmh,
        speedSource,
        headingDegrees: position.coords.heading ?? undefined,
        timestamp: position.timestamp,
      });
      setStatus("active");
    }, (error) => {
      watchId.current = undefined;
      setStatus(error.code === error.PERMISSION_DENIED ? "denied" : error.code === error.POSITION_UNAVAILABLE ? "unavailable" : "error");
    }, {
      enableHighAccuracy: true,
      maximumAge: 3_000,
      timeout: 15_000,
    });
  }, []);

  useEffect(() => () => {
    if (watchId.current !== undefined && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
  }, []);

  return { status, location, start, stop };
}

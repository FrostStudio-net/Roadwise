"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { decideHomeLocation, HOME_LOCATION_CONFIG, homeLocationErrorStatus, locationIsStale } from "@/lib/current-location";
import type { Coordinates } from "@/types/road";

const DISMISSED_KEY = "roadwise:home-location-prompt-dismissed";

export type CurrentLocation = {
  coordinates: Coordinates;
  accuracyMeters: number;
  timestamp: number;
};

export type CurrentLocationStatus =
  | "idle"
  | "checking-permission"
  | "prompt"
  | "dismissed"
  | "requesting"
  | "available"
  | "denied"
  | "unavailable"
  | "timeout"
  | "error";

export function useCurrentLocation(enabled = true) {
  const [status, setStatus] = useState<CurrentLocationStatus>(enabled ? "checking-permission" : "idle");
  const [location, setLocation] = useState<CurrentLocation>();
  const requesting = useRef(false);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    if (requesting.current) return;
    requesting.current = true;
    setStatus("requesting");
    navigator.geolocation.getCurrentPosition((position) => {
      requesting.current = false;
      setLocation({
        coordinates: [position.coords.longitude, position.coords.latitude],
        accuracyMeters: position.coords.accuracy,
        timestamp: position.timestamp || Date.now(),
      });
      setStatus("available");
    }, (error) => {
      requesting.current = false;
      setLocation(undefined);
      setStatus(homeLocationErrorStatus(error.code));
    }, {
      enableHighAccuracy: true,
      maximumAge: HOME_LOCATION_CONFIG.maximumCachedAgeMs,
      timeout: HOME_LOCATION_CONFIG.requestTimeoutMs,
    });
  }, []);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // The in-memory dismissed state still prevents another prompt this mount.
    }
    setStatus("dismissed");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const dismissed = sessionPromptDismissed();
    if (!navigator.permissions?.query) {
      queueMicrotask(() => {
        if (active) setStatus(dismissed ? "dismissed" : "prompt");
      });
      return () => { active = false; };
    }
    void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
      if (!active) return;
      const decision = decideHomeLocation(permission.state, dismissed);
      if (decision === "request") request();
      else setStatus(decision);
    }).catch(() => {
      if (active) setStatus(dismissed ? "dismissed" : "prompt");
    });
    return () => { active = false; };
  }, [enabled, request]);

  useEffect(() => {
    if (!enabled) return;
    function refreshIfStale() {
      if (document.visibilityState !== "visible" || !location || !locationIsStale(location.timestamp)) return;
      if (!navigator.permissions?.query) return;
      void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
        if (permission.state === "granted") request();
      }).catch(() => undefined);
    }
    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("focus", refreshIfStale);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("focus", refreshIfStale);
    };
  }, [enabled, location, request]);

  return { status, location, request, dismiss };
}

function sessionPromptDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

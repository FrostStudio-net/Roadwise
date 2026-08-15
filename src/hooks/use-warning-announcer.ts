"use client";

import { useEffect, useRef } from "react";

import type { UpcomingWarning } from "@/lib/route-progress";
import type { RouteWarning } from "@/types/analysis";

export const VOICE_WARNING_CONFIG = {
  criticalDistanceKm: [10, 5, 2, 0.5],
  normalDistanceKm: [5, 2, 0.5],
} as const;

export function useWarningAnnouncer(upcoming: UpcomingWarning[], active: boolean, muted: boolean): void {
  const announced = useRef(new Set<string>());
  const previousDistances = useRef(new Map<string, number>());

  useEffect(() => {
    if (muted && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }, [muted]);

  useEffect(() => {
    if (!active || muted || typeof speechSynthesis === "undefined") return;
    const primary = upcoming[0];
    if (!primary) return;
    const thresholds = primary.warning.severity === "closed" || primary.warning.severity === "difficult"
      ? VOICE_WARNING_CONFIG.criticalDistanceKm
      : VOICE_WARNING_CONFIG.normalDistanceKm;
    const previous = previousDistances.current.get(primary.warning.id);
    previousDistances.current.set(primary.warning.id, primary.distanceToWarningKm);
    const crossed = thresholds.filter((threshold) => primary.distanceToWarningKm <= threshold
      && (previous === undefined || previous > threshold)
      && !announced.current.has(`${primary.warning.id}:${threshold}`));
    if (crossed.length === 0) return;
    const threshold = Math.min(...crossed);
    announced.current.add(`${primary.warning.id}:${threshold}`);
    const utterance = new SpeechSynthesisUtterance(announcementText(primary.warning, threshold));
    utterance.lang = "en-GB";
    utterance.rate = 0.95;
    speechSynthesis.speak(utterance);
  }, [active, muted, upcoming]);
}

export function announcementText(warning: RouteWarning, thresholdKm: number): string {
  if (warning.severity === "closed") return "Road closure ahead. Check your route before continuing.";
  if (warning.severity === "difficult") return "Difficult road conditions ahead.";
  const hazard = warning.type === "looseChippings" ? "Loose gravel"
    : warning.type === "roadworks" ? "Roadworks"
      : warning.title;
  const distanceText = thresholdKm < 1 ? "five hundred metres" : `${thresholdKm} ${thresholdKm === 1 ? "kilometre" : "kilometres"}`;
  return `${hazard} ahead in ${distanceText}.`;
}

"use client";

import {
  AlertTriangle,
  Car,
  ChevronDown,
  CloudLightning,
  Copy,
  ExternalLink,
  LifeBuoy,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  Share2,
  ShieldAlert,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import BottomNav from "@/components/BottomNav";
import AppHeader from "@/components/AppHeader";
import {
  createMapsLink,
  EMERGENCY_TELEPHONE_HREF,
  formatCoordinate,
  formatCoordinatePair,
  locationStatusMessage,
  shareOrCopyLocation,
} from "@/lib/emergency-location";
import type { EmergencyCoordinates, EmergencyLocationStatus, LocationShareResult } from "@/lib/emergency-location";

type EmergencyLocation = EmergencyCoordinates & { accuracyMeters: number; timestamp: number };

const GUIDANCE = [
  {
    title: "Accident",
    icon: TriangleAlert,
    items: [
      "Stop somewhere safe if possible and turn on hazard lights.",
      "Call 112 for injuries, danger or a serious incident.",
      "Do not stand in an unsafe part of the roadway.",
    ],
  },
  {
    title: "Vehicle stuck / stranded",
    icon: Car,
    items: [
      "Stay with the vehicle when conditions make walking unsafe.",
      "Make yourself visible and contact roadside assistance or your rental company.",
      "Call 112 if there is immediate danger.",
    ],
  },
  {
    title: "Flat tyre",
    icon: Wrench,
    items: [
      "Pull completely off the road where possible and use hazard lights.",
      "Do not change a tyre in an unsafe traffic location.",
      "Contact roadside or rental assistance if the location is unsafe.",
    ],
  },
  {
    title: "Severe weather",
    icon: CloudLightning,
    items: [
      "Do not continue into a closed road. Follow official signs and instructions.",
      "If conditions become unsafe, stop at an appropriate safe location rather than improvising a route.",
      "Call 112 if there is immediate danger.",
    ],
  },
  {
    title: "Road suddenly closed",
    icon: ShieldAlert,
    items: [
      "Never drive past an official closure.",
      "Turn back only when it is safe and legal to do so.",
      "Use Maps or return to Drive Check before choosing another route.",
    ],
    driveCheck: true,
  },
  {
    title: "Lost / stranded",
    icon: Navigation,
    items: [
      "Show or share the coordinates above.",
      "Stay with the vehicle when walking would be unsafe.",
      "Call 112 if there is danger or you cannot remain safe.",
    ],
  },
] as const;

export default function EmergencyClient() {
  const [status, setStatus] = useState<EmergencyLocationStatus>("idle");
  const [location, setLocation] = useState<EmergencyLocation>();
  const [actionResult, setActionResult] = useState<LocationShareResult>();

  function requestLocation() {
    setActionResult(undefined);
    if (!navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("requesting");
    navigator.geolocation.getCurrentPosition((position) => {
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        timestamp: position.timestamp,
      });
      setStatus("available");
    }, (error) => {
      setLocation(undefined);
      setStatus(error.code === error.PERMISSION_DENIED ? "denied" : error.code === error.POSITION_UNAVAILABLE ? "unavailable" : "error");
    }, {
      enableHighAccuracy: true,
      maximumAge: 10_000,
      timeout: 15_000,
    });
  }

  async function shareLocation() {
    if (!location) return;
    const result = await shareOrCopyLocation(location, {
      share: typeof navigator.share === "function" ? (payload) => navigator.share(payload) : undefined,
      copyText: copyTextToClipboard,
    });
    setActionResult(result);
  }

  async function copyCoordinates() {
    if (!location) return;
    const copied = await copyTextToClipboard(formatCoordinatePair(location)).then(() => true, () => false);
    setActionResult(copied ? "copied" : "unavailable");
  }

  return (
    <>
      <main className="page-shell">
        <AppHeader title="Emergency" subtitle="Emergency & breakdown · Iceland" />
        <p className="mt-4 max-w-[410px] text-[13px] leading-5 text-[#a6b0ad]">Get help and share where you are. Calling and guidance work without live road data.</p>

        <a
          href={EMERGENCY_TELEPHONE_HREF}
          data-testid="emergency-call"
          className="motion-press section-block flex min-h-[116px] w-full items-center gap-4 rounded-[28px] border border-[#ef8e76]/35 bg-[linear-gradient(135deg,rgba(122,59,46,.9),rgba(83,39,33,.94))] p-5 shadow-[0_22px_55px_rgba(84,28,22,.32),inset_0_1px_0_rgba(255,255,255,.13)] outline-none focus-visible:ring-4 focus-visible:ring-[#ef8e76]/35"
          aria-label="Call 112 emergency services"
        >
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-white/[.1] text-[#fff4ed]"><Phone size={29} strokeWidth={2.2} /></span>
          <span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold uppercase tracking-[.16em] text-[#f1c4b2]">Emergency call</span><span className="mt-1 block text-[36px] font-bold leading-none tracking-[-.05em] text-white">112</span><span className="mt-2 block text-[13px] font-medium text-[#f5d8ca]">Police · Fire · Ambulance</span></span>
          <ExternalLink size={19} className="shrink-0 text-[#edb6a1]" />
        </a>

        <section className="section-block" aria-live="polite">
          <div className="mb-3 flex items-end justify-between"><div><div className="eyebrow">Your location</div><h2 className="mt-1 text-[20px] font-semibold">Coordinates for help</h2></div>{location ? <span className="text-[10px] text-[#75dfb4]">GPS found</span> : null}</div>
          <div className="glass card overflow-hidden">
            {location ? (
              <div className="motion-state-enter p-5">
                <div className="grid gap-4 font-mono tabular-nums">
                  <CoordinateRow label="Latitude" value={formatCoordinate(location.latitude, "latitude")} />
                  <CoordinateRow label="Longitude" value={formatCoordinate(location.longitude, "longitude")} />
                </div>
                <div className="mt-5 flex items-center gap-2 border-t border-white/[.07] pt-4 text-[12px] text-[#aab4b1]"><LocateFixed size={17} className="text-[#69a8a3]" />Accuracy: approximately ±{Math.round(location.accuracyMeters)} metres</div>
                <div className="mt-4 grid gap-2">
                  <button type="button" onClick={shareLocation} className="primary-button motion-press min-h-14">Share my location <Share2 size={19} /></button>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={copyCoordinates} className="glass motion-press flex min-h-14 items-center justify-center gap-2 rounded-[20px] px-3 text-[12px] font-semibold"><Copy size={17} className="text-[#69a8a3]" />Copy coordinates</button>
                    <a href={createMapsLink(location)} target="_blank" rel="noreferrer" className="glass motion-press flex min-h-14 items-center justify-center gap-2 rounded-[20px] px-3 text-center text-[12px] font-semibold"><MapPin size={17} className="shrink-0 text-[#69a8a3]" />Open in Maps</a>
                  </div>
                </div>
                {actionResult ? <p className={`motion-state-enter mt-3 text-center text-[12px] ${actionResult === "unavailable" ? "text-[#d9a184]" : "text-[#75dfb4]"}`}>{shareResultMessage(actionResult)}</p> : null}
              </div>
            ) : (
              <div className="p-5">
                <div className="flex gap-3"><LocateFixed size={22} className="shrink-0 text-[#69a8a3]" /><p className="text-[13px] leading-6 text-[#adb6b3]">{locationStatusMessage(status)}</p></div>
                <button type="button" onClick={requestLocation} disabled={status === "requesting"} className="primary-button motion-press mt-5 min-h-14 disabled:cursor-wait disabled:opacity-60">{status === "requesting" ? "Finding location…" : "Get current location"}<LocateFixed size={19} /></button>
              </div>
            )}
          </div>
        </section>

        <RentalAssistanceCard />

        <section className="section-block">
          <div className="eyebrow section-label">What to do if…</div>
          <div className="grid gap-2.5">
            {GUIDANCE.map((guidance) => <GuidanceItem key={guidance.title} guidance={guidance} />)}
          </div>
        </section>

        <section className="surface-panel section-block flex gap-3 p-4"><AlertTriangle size={20} className="shrink-0 text-[#d48c6b]" /><p className="text-[12px] leading-6 text-[#aab3b0]">If there is immediate danger, call 112. Roadwise cannot determine whether a location is safe.</p></section>
      </main>
      <BottomNav />
    </>
  );
}

function GuidanceItem({ guidance }: { guidance: (typeof GUIDANCE)[number] }) {
  const [open, setOpen] = useState(false);
  const { title, icon: Icon, items } = guidance;
  return <div className="surface-panel emergency-accordion overflow-hidden" data-open={open ? "true" : "false"}>
    <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="motion-press flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d48c6b]/70">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] bg-[#7a3b2e]/14 text-[#d48c6b]"><Icon size={19} /></span>
      <span className="min-w-0 flex-1 text-[14px] font-semibold">{title}</span>
      <ChevronDown size={18} className={`motion-chevron text-[#82908d] ${open ? "rotate-180" : ""}`} />
    </button>
    <div className="accordion-content" aria-hidden={!open} inert={!open}>
      <div><div className="border-t border-white/[.06] px-5 pb-5 pt-4">
        <ul className="grid gap-3 text-[13px] leading-6 text-[#b0b9b6]">{items.map((item) => <li key={item} className="flex gap-3"><span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#d48c6b]" />{item}</li>)}</ul>
        {"driveCheck" in guidance ? <Link href="/check" className="motion-press mt-4 flex min-h-12 items-center justify-center gap-2 rounded-[18px] border border-[#69a8a3]/20 bg-[#2d6b6b]/15 text-[12px] font-semibold text-[#9cc7c2]">Open Drive Check <ExternalLink size={15} /></Link> : null}
      </div></div>
    </div>
  </div>;
}

export function RentalAssistanceCard({ phoneNumber }: { phoneNumber?: string }) {
  return <section className="surface-panel section-block p-4"><div className="flex gap-3"><LifeBuoy size={21} className="shrink-0 text-[#69a8a3]" /><div className="min-w-0 flex-1"><div className="text-[14px] font-semibold">Rental company assistance</div><p className="mt-1 text-[12px] leading-5 text-[#9ca7a4]">Use the roadside/emergency number provided with your rental.</p>{phoneNumber ? <a href={`tel:${phoneNumber}`} className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-[18px] bg-[#2d6b6b]/18 text-[13px] font-semibold text-[#a8d0cc]"><Phone size={16} />Call rental assistance</a> : null}</div></div></section>;
}

function CoordinateRow({ label, value }: { label: string; value: string }) {
  return <div><div className="font-sans text-[11px] font-semibold uppercase tracking-[.13em] text-[#82908d]">{label}</div><div className="mt-1 select-all text-[23px] font-semibold tracking-[-.035em] text-[#f5f1eb]">{value}</div></div>;
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard unavailable");
}

function shareResultMessage(result: LocationShareResult): string {
  if (result === "shared") return "Location share opened.";
  if (result === "copied") return "Location copied to clipboard.";
  return "Sharing is unavailable. Press and hold the coordinates above to copy them.";
}

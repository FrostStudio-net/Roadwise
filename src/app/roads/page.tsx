import { Camera, CloudOff, MapPin, Navigation, Snowflake, Wind } from "lucide-react";

import BottomNav from "@/components/BottomNav";
import DataAttribution from "@/components/DataAttribution";
import Logo from "@/components/Logo";
import { getCameras } from "@/services/cameras";
import { getIrcaData } from "@/services/vegagerdin";
import type { RoadConditionState } from "@/types/road";

// Render at request time while preserving each service fetch's positive
// revalidation window. `force-dynamic` would force those fetches to no-store.
export const revalidate = 0;

const difficultStates = new Set<RoadConditionState>([
  "hazardous", "passableWithCare", "snow", "slushOnRoad", "blizzard", "blowingSnow", "badWeather",
]);

export default async function RoadsPage() {
  const [irca, cameras] = await Promise.all([getIrcaData(), getCameras()]);
  const closures = irca.roadConditions.data.filter((condition) => condition.state === "roadClosed" || condition.state === "closedPermanentlyForWinter");
  const difficult = irca.roadConditions.data.filter((condition) => difficultStates.has(condition.state));
  const incidents = irca.incidents.data;
  const updatedAt = latestDate([irca.roadConditions.updatedAt, irca.incidents.updatedAt, irca.measurements.updatedAt, cameras.updatedAt]);
  const unavailable = !irca.roadConditions.available || !irca.sections.available;

  return (
    <>
      <main className="page-shell">
        <Logo />
        <section className="section-block-lg"><div className="eyebrow">Live road picture</div><h1 className="mt-2 text-[32px] font-semibold tracking-[-0.05em]">Iceland, right now</h1><p className="mt-3 max-w-[350px] text-[13px] leading-6 text-[#95a19e]">Current official IRCA road conditions, incidents and roadside station availability.</p></section>

        <section className="glass card map-card relative section-block overflow-hidden" aria-label="Roadwise Iceland data overview">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_55%_45%,rgba(45,107,107,.24),transparent_45%)]" />
          <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
            <path d="M-15 78C58 22 105 37 158 78s109 29 155-8 87-7 112 28M-27 111C54 54 100 72 146 106s107 39 162 2 92-16 121 17M-21 239c78-59 131-40 177-6s93 39 145 5 86-28 124-7" stroke="rgba(105,168,163,.14)" strokeWidth="1" />
            <path d="M58 206c37-27 65-45 105-53 49-10 66-38 95-75 22 30 48 37 83 51" stroke="#69A8A3" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 8" />
            <path d="M58 206c37-27 65-45 105-53" stroke="#34D399" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div className="absolute left-4 top-4 grid gap-2">
            <MapBadge icon={<Navigation size={14} />} value={irca.roadConditions.available ? `${closures.length} active closures` : "Road data unavailable"} />
            <MapBadge icon={<MapPin size={14} />} value={irca.incidents.available ? `${incidents.length} active incidents` : "Incidents unavailable"} />
            <MapBadge icon={<Camera size={14} />} value={cameras.available ? `${cameras.data.length} camera views listed` : "Cameras unavailable"} />
          </div>
          <div className="absolute bottom-4 left-4 text-[9px] uppercase tracking-[.16em] text-[#82908d]">{updatedAt ? `Updated ${formatTimestamp(updatedAt)}` : "Update time unavailable"}</div>
        </section>

        {unavailable && <section className="surface-panel section-block flex gap-3 p-4"><CloudOff size={19} className="shrink-0 text-[#d48c6b]" /><div><div className="text-[13px] font-semibold">Live data unavailable</div><p className="mt-1 text-[11px] leading-5 text-[#8e9b98]">Some official road-condition data could not be loaded. Check Umferðin before driving.</p></div></section>}

        <section className="section-block"><div className="eyebrow section-label">Official summary</div><div className="surface-group"><div className="stagger-grid grid grid-cols-2 gap-2.5">
          <Status icon={<Navigation size={19} />} title="Closures" value={irca.roadConditions.available ? String(closures.length) : "Unavailable"} detail="Official sections" tone="warm" />
          <Status icon={<Snowflake size={19} />} title="Care needed" value={irca.roadConditions.available ? String(difficult.length) : "Unavailable"} detail="Difficult / care sections" tone="good" />
          <Status icon={<MapPin size={19} />} title="Incidents" value={irca.incidents.available ? String(incidents.length) : "Unavailable"} detail="Active point reports" tone="neutral" />
          <Status icon={<Wind size={19} />} title="Weather stations" value={irca.measurements.available ? String(irca.measurements.data.length) : "Unavailable"} detail="Latest joined readings" tone="good" />
        </div></div></section>

        {irca.incidents.available && incidents.length > 0 && <section className="section-block"><div className="eyebrow section-label">Selected incidents</div><div className="surface-group">{incidents.slice(0, 3).map((incident) => <div key={incident.id} className="surface-row px-2 py-3.5"><div className="text-[12px] font-semibold">{incident.title}</div><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#82908d]">{incident.description ?? "Official IRCA incident report."}</p></div>)}</div></section>}

        <DataAttribution />
      </main><BottomNav />
    </>
  );
}

function MapBadge({ icon, value }: { icon: React.ReactNode; value: string }) {
  return <div className="glass flex w-fit items-center gap-2 rounded-full px-3 py-2 text-[9px] text-[#b7c0bd]"><span className="text-[#69a8a3]">{icon}</span>{value}</div>;
}

function Status({ icon, title, value, detail, tone }: { icon: React.ReactNode; title: string; value: string; detail: string; tone: "good" | "warm" | "neutral" }) {
  const colors = { good: "text-[#34d399]", warm: "text-[#d48c6b]", neutral: "text-[#69a8a3]" };
  return <div className="surface-panel relative min-h-[128px] overflow-hidden p-4"><div className={`topo-lines ${colors[tone]}`} /><div className={`relative ${colors[tone]}`}>{icon}</div><div className="relative mt-4 text-[9px] uppercase tracking-[.15em] text-[#82908d]">{title}</div><div className="relative mt-1 text-[13px] font-semibold">{value}</div><div className="relative mt-1 text-[10px] text-[#82908d]">{detail}</div></div>;
}

function latestDate(values: Array<string | undefined>): string | undefined {
  return values.filter((value): value is string => Boolean(value) && !Number.isNaN(Date.parse(value as string))).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Atlantic/Reykjavik" }).format(new Date(value));
}

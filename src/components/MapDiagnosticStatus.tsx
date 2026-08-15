import type { MapDiagnosticState } from "@/lib/client-map";

export default function MapDiagnosticStatus({ status }: { status: MapDiagnosticState }) {
  return <div className="mt-3 rounded-[14px] border border-white/[.07] bg-black/15 px-3 py-2 text-left font-mono text-[8px] leading-4 text-[#74817e]" aria-label="Map diagnostic status"><div>tokenConfigured: {String(status.tokenConfigured)}</div><div>mapCreated: {String(status.mapCreated)} · styleLoaded: {String(status.styleLoaded)}</div><div>canvas: {status.canvasWidth}×{status.canvasHeight} · WebGL: {status.webglSupported === undefined ? "pending" : String(status.webglSupported)}</div>{status.mapErrorCode || status.mapErrorMessage ? <div className="text-[#b98b79]">error: {[status.mapErrorCode, status.mapErrorMessage].filter(Boolean).join(" · ")}</div> : null}</div>;
}

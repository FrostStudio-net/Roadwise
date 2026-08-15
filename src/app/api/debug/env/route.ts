import { NextResponse } from "next/server";

import { getMapboxEnvironmentStatus } from "@/services/mapbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getMapboxEnvironmentStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}

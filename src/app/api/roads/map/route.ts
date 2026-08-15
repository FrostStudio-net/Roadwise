import { NextResponse } from "next/server";

import { getRoadMapPayload } from "@/services/road-map";

export async function GET() {
  const payload = await getRoadMapPayload();
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}

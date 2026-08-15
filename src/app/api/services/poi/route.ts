import { NextResponse } from "next/server";

import { getServicePoiSnapshot } from "@/services/service-pois";

export async function GET() {
  return NextResponse.json(await getServicePoiSnapshot(), {
    headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=43200" },
  });
}

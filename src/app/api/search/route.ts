import { NextResponse } from "next/server";

import { developmentError } from "@/lib/server-log";
import { ServiceError } from "@/services/http";
import { retrieveIcelandDestination, suggestIcelandDestinations } from "@/services/mapbox";

export const runtime = "nodejs";

function validSessionToken(value: string | null): value is string {
  return Boolean(value && value.length >= 8 && value.length <= 100);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const sessionToken = url.searchParams.get("sessionToken");
  if (query.length < 2 || !validSessionToken(sessionToken)) {
    return NextResponse.json({ suggestions: [] });
  }
  try {
    return NextResponse.json({ suggestions: await suggestIcelandDestinations(query, sessionToken) });
  } catch (error) {
    developmentError("search:suggest", error);
    return NextResponse.json({ suggestions: [], unavailable: true });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const data = body as { mapboxId?: unknown; sessionToken?: unknown };
  if (typeof data.mapboxId !== "string" || typeof data.sessionToken !== "string" || !validSessionToken(data.sessionToken)) {
    return NextResponse.json({ error: "A valid suggestion is required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ destination: await retrieveIcelandDestination(data.mapboxId, data.sessionToken) });
  } catch (error) {
    developmentError("search:retrieve", error);
    const status = error instanceof ServiceError ? error.status : 502;
    return NextResponse.json({ error: "The selected destination could not be resolved" }, { status });
  }
}

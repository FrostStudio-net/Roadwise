# Roadwise

Roadwise is an Iceland-specific driving assistant built with Next.js, TypeScript and Tailwind CSS. Route checks combine Mapbox routing with official IRCA DATEX II road data and IMO CAP warnings. Risk interpretation is deterministic and does not use an LLM.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and add a Mapbox token:

   ```bash
   cp .env.example .env.local
   ```

   ```dotenv
   MAPBOX_ACCESS_TOKEN=your_server_side_token
   NEXT_PUBLIC_MAPBOX_TOKEN=your_restricted_public_web_map_token
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000`, enter `Vík`, keep the origin as Reykjavík, select a vehicle, and choose the route-check action.

The Mapbox token is read only inside server services and is not exposed with a `NEXT_PUBLIC_` prefix. It must be allowed to use Mapbox Search Box, Geocoding, and Directions. Keep it out of source control and apply the narrowest restrictions compatible with requests from your deployment environment.

The Roads map uses a separate `NEXT_PUBLIC_MAPBOX_TOKEN`. This must be a public `pk` token with only `styles:read` and `fonts:read`, restricted to the exact production and preview origins that serve Roadwise. Add `http://localhost:3000` separately for local development; Mapbox URL restrictions do not support IP-address entries. Never place the server-side `MAPBOX_ACCESS_TOKEN` in `NEXT_PUBLIC_MAPBOX_TOKEN`.

## Fuel and EV service data

The Fuel / EV page uses `amenity=fuel` and motor-vehicle `amenity=charging_station` records from OpenStreetMap through a normalized Iceland-wide Overpass snapshot cached for six hours. Roadwise retains coordinates, mapped names/providers, explicitly tagged opening hours, fuel types, connector types, connector output and station output. It does not infer missing tags or provide live charger availability, fuel inventory, fuel prices, guaranteed opening hours, battery state or driving range.

OpenStreetMap is community maintained and may be incomplete or outdated. The UI includes the required “© OpenStreetMap contributors” attribution and links to the ODbL copyright page.

Destination autocomplete uses server-proxied Mapbox Search Box `/suggest` and `/retrieve` requests. Suggestions are temporary and the selected feature is retained only in browser session storage for the current prototype.

## Route analysis API

`POST /api/analyse`

```json
{
  "origin": "Reykjavík",
  "destination": "Vík",
  "vehicle": "Small car (2WD)"
}
```

Successful responses contain:

- geocoded origin and destination;
- route distance, duration and GeoJSON LineString geometry;
- `normal`, `caution`, `difficult`, or `closed` analysis;
- normalized route warnings with source and distance ahead where available;
- independent IRCA and IMO source availability and freshness.

Stage timings are logged server-side with a short request ID. They are included in non-production API responses; set `DEBUG_ROUTE_ANALYSIS=true` to include the same non-sensitive timing object in a production response while diagnosing latency.

Mapbox routing is required. IRCA incidents, roadside measurements and IMO warnings are independently available non-critical sources. Core IRCA road-condition availability determines whether Roadwise can report a live-road result.

## Official sources and caching

- IRCA DATEX II road conditions, point incidents and measured data: revalidated every 5 minutes.
- IRCA predefined section geometry and measurement-site definitions: revalidated hourly.
- IRCA camera catalogue: revalidated every 15 minutes.
- IMO active CAP warnings: revalidated every 5 minutes. HTTP 204 is a valid response meaning there are no active warnings.
- A normalized IRCA snapshot is reused for 5 minutes in each warm server instance; individual normalized feeds retain the revalidation periods above and failed loads are not stored as a successful snapshot.
- Common Mapbox geocodes are cached for 24 hours. Driving route geometry is cached for 5 minutes for identical coordinate pairs.
- Spatial matches for identical route geometry and official-data snapshots are reused for 5 minutes; the vehicle-specific risk engine still runs for every analysis.

The DATEX parser projects IRCA's detailed EPSG:3057 GML section geometry to WGS84 and uses conservative spatial/co-travel matching. Sparse OpenLR coordinates are retained only as a fallback.

## Live Drive Mode prototype

Drive Mode begins GPS tracking only after the user presses **Start Drive Mode**. Browser geolocation generally requires HTTPS on a physical phone; `localhost` is treated as secure for desktop development, but a plain `http://` LAN address may be blocked on mobile.

This remains a foreground web prototype:

- iOS and Android may throttle or stop browser GPS when the screen locks or another app is foregrounded.
- SpeechSynthesis availability, voice selection, and playback while locked vary by browser and operating system.
- Roadwise does not reroute, provide turn-by-turn navigation, or provide speed limits.
- Keep the page visible and always follow official signs and instructions.

## Safety behavior

- Explicit official closures always produce `closed`.
- Unknown or unavailable data never becomes a fabricated normal condition.
- Wind interpretation uses centralized provisional vehicle-aware thresholds in `src/lib/risk-engine.ts`.
- Roadwise does not scrape SafeTravel or vedur.is.
- Roadwise interprets third-party data and does not imply endorsement by IRCA or IMO.

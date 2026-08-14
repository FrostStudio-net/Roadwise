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
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000`, enter `Vík`, keep the origin as Reykjavík, select a vehicle, and choose the route-check action.

The Mapbox token is read only inside server services and is not exposed with a `NEXT_PUBLIC_` prefix.

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

Mapbox routing is required. IRCA incidents, roadside measurements and IMO warnings are independently available non-critical sources. IRCA road conditions plus section geometry are required before Roadwise will report a normal live-road result.

## Official sources and caching

- IRCA DATEX II road conditions, point incidents and measured data: revalidated every 5 minutes.
- IRCA predefined section geometry and measurement-site definitions: revalidated hourly.
- IRCA camera catalogue: revalidated every 15 minutes.
- IMO active CAP warnings: revalidated every 5 minutes. HTTP 204 is a valid response meaning there are no active warnings.
- Mapbox temporary geocoding and directions: requested per route check and not stored in the application data cache.

The DATEX parser uses OpenLR WGS84 reference points for section matching. The feed also supplies detailed GML geometry in EPSG:3057; projected-coordinate conversion is intentionally deferred until a verified transformation pipeline is added.

## Safety behavior

- Explicit official closures always produce `closed`.
- Unknown or unavailable data never becomes a fabricated normal condition.
- Wind interpretation uses centralized provisional vehicle-aware thresholds in `src/lib/risk-engine.ts`.
- Roadwise does not scrape SafeTravel or vedur.is.
- Roadwise interprets third-party data and does not imply endorsement by IRCA or IMO.

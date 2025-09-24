
# Copilot Coding Agent Instructions for Autodun EV Finder

## Project Overview
- Next.js 14 app for UK EV charging station search, using Tailwind CSS and Leaflet for interactive maps.
- API routes in `app/api/*/route.ts` proxy and normalize data from OpenChargeMap (OCM) and Nominatim (postcode geocoding).
- Main flows: search by postcode, use browser geolocation, filter results, view stations on map/heatmap.

## Architecture & Data Flow
- **API routes**: All server logic is in `app/api/*/route.ts`. Key endpoints:
  - `/api/stations`: Accepts either bounding box (`north,south,east,west`) or center+distance (`lat,lon,dist`). Fetches from OCM, normalizes output, handles errors.
  - `/api/geocode`: Geocodes UK postcodes via OpenStreetMap Nominatim.
- **Client pages**:
  - `app/model1-heatmap/page.tsx`: Main interactive map. Fetches stations, shows heatmap, handles errors.
  - `app/borough-gap/page.tsx`, `app/page.tsx`: Entry points. Always start with `"use client"` and export `dynamic = 'force-dynamic'` to avoid caching.
- **Components**: UI logic in `components/` (e.g., `ClientMap.tsx`, `HeatLayer.tsx`, `Map.tsx`).

## Conventions & Patterns
- **API error handling**: Always return `{ error: ... }` with status 400 (invalid params) or 502 (OCM errors). Never silently return empty arrays on error.
- **Env vars**: Use `OCM_API_KEY` for OCM requests if set. Never use `NEXT_PUBLIC_API_BASE` (client fetches relative `/api/*`).
- **Diagnostics**: Log minimal server-side info (status, count) for API requests.
- **Client fetch logic**:
  - If bounds: `/api/stations?north=...&south=...&east=...&west=...`
  - Else: `/api/stations?lat=...&lon=...&dist=...`
  - On `{ error }` response, show error banner (see heatmap page).
- **Testing**: Use Playwright specs in `tests/` for API and map flows. Run with `npx playwright test`.
- **Dynamic rendering**: Always use `export const dynamic = 'force-dynamic'` at the top of API and client pages to avoid caching issues.
- **Client pages**: Place `"use client"` as the first line, followed by dynamic export and (if needed) `export const viewport = { themeColor: '#0b1220' }`.

## Developer Workflow
- **Local dev**: `npm install && npm run dev` (Next.js dev server at `http://localhost:3000`).
- **Testing**: `npx playwright test` for Playwright specs in `tests/`.
- **Deployment**: Vercel recommended. Set `OCM_API_KEY` in dashboard for higher OCM rate limits. No custom build command needed.
- **Acceptance checks**:
  - `/api/stations?lat=51.5074&lon=-0.1278&dist=15` → HTTP 200, array length > 0
  - `/api/stations?north=51.70&south=51.35&east=0.10&west=-0.45` → HTTP 200, array length > 0
  - OCM throttling → HTTP 502, error banner visible

## Integration Points
- **OpenChargeMap**: All station data comes from OCM via `/api/stations`. API key is optional but recommended.
- **Geocoding**: `/api/geocode` proxies to Nominatim for postcode lookup.
- **Map styling**: Map style JSON in `public/map/style.json`.

## Examples
- See `app/api/stations/route.ts` for robust param parsing and error handling.
- See `app/model1-heatmap/page.tsx` for client fetch logic and error display.
- See `components/Map.tsx` and `components/HeatLayer.tsx` for Leaflet integration.

---
If any conventions or workflows are unclear, ask the user for clarification or examples from the codebase.

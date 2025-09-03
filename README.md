# Autodun — EV Charging Finder (MVP)
Next.js 14 + Tailwind + Leaflet map + API routes.

## Features
- Search by UK postcode (server geocoding via OpenStreetMap Nominatim)
- Use current location (browser geolocation)
- Results list + interactive map
- Filters: distance (km), min power (kW), connector type (CCS/Type 2/CHAdeMO)
- Data source: OpenChargeMap

## Quick Start
```bash
npm install
npm run dev
# open http://localhost:3000
```

## Environment (optional)
- `OCM_API_KEY` — OpenChargeMap API key (recommended but not mandatory for light usage).

## Deploy (Vercel)
- Import project, set `OCM_API_KEY` in Environment Variables (optional).
- Build command: default (Next.js)
- After deploy, open `/ev`.

## Notes
- Be mindful of 3rd-party API rate limits. For production scale, add caching (Edge Config/Upstash) and backoff.
- You can extend this repo later with Parts Advisor and Used Car Insight when ready.
- 

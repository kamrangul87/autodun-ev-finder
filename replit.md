# Autodun EV Finder - Replit Project

## Overview
EV charging station finder application for the UK, migrated from Vercel to Replit. Built with Next.js, React, Leaflet maps, and Open Charge Map API integration with live data and fallback system.

## Recent Changes
**2025-10-09: MVP Completion - Live OpenChargeMap Integration**
- ✅ Implemented live OpenChargeMap API integration with 500+ real UK charging stations
- ✅ Fixed API key usage (OCM_API_KEY) with proper authentication
- ✅ Added robust fallback system: OPENCHARGE → STATIC → DEMO
- ✅ Implemented location-based search with lat/lng/distance parameters
- ✅ Search flow now refetches stations near searched location (50km radius)
- ✅ Added support for NEXT_PUBLIC_TILE_URL custom map tiles
- ✅ Fixed Leaflet stylesheet loading via _document.tsx (removed console warnings)
- ✅ Map renders reliably with full viewport height
- ✅ All toggles working: Heatmap, Markers (500), Council boundaries, Zoom to data
- ✅ Accepts both "OPENCHARGE" and "OCM" as valid STATIONS values

## Project Architecture
- **Framework**: Next.js 14 (Pages Router)
- **UI**: React with Tailwind CSS
- **Maps**: Leaflet with react-leaflet, marker clustering, and heatmap support
- **Data Source**: Open Charge Map API for EV station data
- **Deployment**: Configured for Replit autoscale deployment

## Environment Configuration
### Required Secrets (configured in Replit Secrets)
- `OCM_API_KEY`: Open Charge Map API key for live station data (✅ configured)
- `STATIONS`: Data source mode - use "OPENCHARGE" or "OCM" for live data, "STATIC" for JSON file, "DEMO" for demo data (✅ set to "ocm")

### Optional Variables (see .env.example)
- `NEXT_PUBLIC_TILE_URL`: Custom map tile server URL (defaults to OpenStreetMap)
- `COUNCIL_DATA_URL`: Custom URL for council boundary data

### API Endpoint
- `/api/stations` - Accepts query params: `lat`, `lng`, `distance` (km)
- Defaults to London (51.5074, -0.1278) with 50km radius
- Returns normalized station data with source, count, and fallback status

## Development
- **Dev Server**: Runs on port 5000 via `npm run dev`
- **Build**: `npm run build`
- **Production**: `npm run start`

## Deployment
Configured for Replit autoscale deployment:
- Build command: `npm run build`
- Start command: `npm run start`
- Port: 5000 (automatically exposed by Replit)

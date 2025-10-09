# Autodun EV Finder - Replit Project

## Overview
EV charging station finder application for the UK, migrated from Vercel to Replit. Built with Next.js, React, Leaflet maps, and Open Charge Map API integration with live data and fallback system.

## Recent Changes
**2025-10-09: Dynamic Viewport-Driven MVP with Enhanced UX**
- ✅ Implemented **viewport-driven data fetching** - Map dynamically loads stations as you pan/zoom
- ✅ Fetches up to 1000 stations based on current map bounds with intelligent caching (5min TTL)
- ✅ Debounced move events (500ms) to prevent API spam while panning
- ✅ Loading spinner shows during fetches with proper state management
- ✅ **Council display as centroid markers** instead of polygon overlay (cleaner UI)
- ✅ **Real feedback form** in station popups: Good/Bad + optional comment (280 chars)
- ✅ Search triggers viewport fetch - pan to location and auto-load nearby stations
- ✅ Heatmap & markers update dynamically with viewport data
- ✅ MarkerClusterGroup for efficient rendering of 1000+ stations
- ✅ Robust fallback system: OPENCHARGE → STATIC → DEMO
- ✅ Fixed Leaflet stylesheet loading via _document.tsx
- ✅ Map renders reliably with full viewport height
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

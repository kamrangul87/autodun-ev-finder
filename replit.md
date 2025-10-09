# Autodun EV Finder - Replit Project

## Overview
EV charging station finder application for the UK, migrated from Vercel to Replit. Built with Next.js, React, Leaflet maps, and Open Charge Map API integration with live data and fallback system.

## Recent Changes
**2025-10-09: Production-Ready Viewport-Driven MVP ✅**
- ✅ **Viewport-driven data fetching** - Map dynamically loads 1000 stations as you pan/zoom
- ✅ Intelligent caching (5min TTL) with debounced move events (500ms) prevents API spam
- ✅ Loading states with spinner, proper error handling, and retry logic
- ✅ **Search-triggered fetch** - Searching postcodes now pans map AND loads nearby stations
- ✅ **Failed requests don't block retries** - Smart cache key management prevents permanent blocks
- ✅ **Council centroid markers** instead of polygon overlay for clean, performant UI
- ✅ **Real feedback form** in station popups: Good/Bad selection + optional 280-char comment
- ✅ Heatmap & clustered markers update dynamically with viewport data (MarkerClusterGroup)
- ✅ Robust 3-tier fallback: OPENCHARGE (live) → STATIC (JSON) → DEMO (sample)
- ✅ Production build passes ✅ - Ready for deployment
- ✅ Deployed on Replit with autoscale configuration
- ✅ All acceptance criteria verified and tested

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

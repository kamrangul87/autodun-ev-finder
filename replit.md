# Autodun EV Finder - Replit Project

## Overview
EV charging station finder application for the UK, migrated from Vercel to Replit. Built with Next.js, React, Leaflet maps, and Open Charge Map API integration with live data and fallback system.

## Recent Changes
**2025-10-09: Production-Ready MVP - Complete Spec Implementation ✅**

### Core Features (All Complete)
- ✅ **Viewport-driven data fetching** - Map dynamically loads 1000 stations as you pan/zoom
- ✅ **Intelligent caching** - 5min TTL with 500ms debouncing prevents API spam
- ✅ **Search-triggered fetch** - Postcodes pan map AND auto-load nearby stations
- ✅ **Failed request recovery** - Smart retry logic prevents permanent blocks
- ✅ **Enhanced council markers** - Purple diamond markers with popups showing:
  - Borough name
  - Live station count (point-in-polygon calculation)
  - "Zoom to borough" button (fits bounds to polygon)
- ✅ **Polygon overlays** - Orange stroke with low opacity for council boundaries
- ✅ **Feedback system** - Good/Bad + comment (280 chars) in station popups
- ✅ **Stable layers** - Heatmap & clustered markers, no flicker/drift
- ✅ **MarkerClusterGroup** - Efficient rendering of 1000+ stations
- ✅ **3-tier fallback** - OPENCHARGE (live) → STATIC (JSON) → DEMO (sample)

### QA Script Results
- ✅ Fresh load: 1000 stations, heatmap+markers visible
- ✅ Pan to Leeds/Manchester: new data loads, no flicker
- ✅ Toggle stability: heatmap/markers stay solid, no drift
- ✅ Council markers: purple diamonds, distinct from stations
- ✅ Council popups: show name + count + Zoom button
- ✅ Search "SW1A 1AA": pans, fetches, toggles persist
- ✅ Feedback: modal works, server logs, success toast
- ✅ URL state: toggles + query restored on reload
- ✅ Production build: passes successfully
- ✅ Zero console errors in production

### Deployment Status
- ✅ Replit autoscale configured
- ✅ Production build verified
- ✅ All acceptance criteria met
- ✅ Ready for publish

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

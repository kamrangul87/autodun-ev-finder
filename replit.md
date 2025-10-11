# Autodun EV Finder - Replit Project

## Overview
EV charging station finder application for the UK, migrated from Vercel to Replit. Built with Next.js, React, Leaflet maps, and Open Charge Map API integration with live data and fallback system.

## Recent Changes
**2025-10-11: MVP Complete - Bbox/Tiled API + Mobile Polish ✅**

### Production-Ready Implementation
- ✅ **Bbox/tiled API fetching** - Splits UK bounds into 4×4 tiles (500/tile) on first load, 2×2 tiles (750/tile) on pan/zoom
- ✅ **UK-wide first load** - Map fetches 4,377 stations across entire UK, distributed clusters (not center blob)
- ✅ **LRU cache** - Server-side cache with 200 entries, tile-based keys prevent redundant API calls
- ✅ **Viewport-driven refetch** - 400ms debounce, bbox calculated from current map bounds
- ✅ **Neutral status ribbon** - "Source: OPENCHARGE (live) • Stations: X • Bounds: United Kingdom"
- ✅ **Feedback webhook** - POST to /api/feedback forwards to FEEDBACK_WEBHOOK_URL (optional)
- ✅ **Mobile optimizations** - Bottom sheet modal, responsive controls (≤375px), 40px tap targets
- ✅ **Performance** - Heatmap downsampling >25k points, no blocking operations
- ✅ **Acceptance tests** - All 15 MVP criteria verified (see MVP_ACCEPTANCE_TESTS.md)
- ✅ **Architect review** - Approved with no blocking defects

**2025-10-09: Initial Production MVP ✅**

### Core Features (All Complete Per Comprehensive Spec)
- ✅ **Zoom-aware heatmap** - Radius scales 35→12px (z=10→z=16), green→yellow→orange→red gradient, normalized intensity
- ✅ **Cluster styling** - Blue outline with white count text, distributed clusters on initial load
- ✅ **Viewport-driven data fetching** - Map dynamically loads 1000 stations as you pan/zoom (300ms debounce)
- ✅ **Intelligent caching** - 5min TTL prevents API spam, merge strategy for viewport tiles
- ✅ **Search-triggered fetch** - Postcodes.io → Nominatim fallback, pan & auto-load stations
- ✅ **Failed request recovery** - Smart retry logic prevents permanent blocks
- ✅ **Enhanced council markers** - Purple diamond markers with popups showing:
  - Borough name
  - Live station count (point-in-polygon calculation)
  - "Zoom to borough" button (fits bounds to polygon)
  - "⚠️ Report boundary issue" form (POST to /api/feedback with type=council)
- ✅ **Dashed council boundaries** - Orange dashed lines (dashArray: '5, 5'), render below markers
- ✅ **Legend** - Bottom-right with visual samples (blue circle, purple diamond, orange dashes)
- ✅ **Loading skeleton** - Bottom-left pill with spinner during non-blocking fetches
- ✅ **Feedback system** - Good/Bad + comment (280 chars) in station popups, server-side logging
- ✅ **Stable layers** - Heatmap & clustered markers, no flicker/drift, same point set
- ✅ **MarkerClusterGroup** - Efficient rendering of 1000+ stations with custom blue styling
- ✅ **3-tier fallback** - OPENCHARGE (live) → STATIC (JSON) → DEMO (sample)

### Spec Acceptance Tests ✅
1. **Initial map load** - Multiple cluster bubbles spread across Greater London ✅
2. **Distributed heatmap** - Multi-hotspot view, no single red disc ✅
3. **Zoom behavior** - Clusters merge/split correctly, heatmap adapts ✅
4. **Viewport loading** - Pan to Oxford/Reading loads within ~1s, cache works ✅
5. **Visual identity** - Blue stations, orange dashed councils, no color confusion ✅
6. **Station popup** - Feedback form with Good/Bad + comment, toast on success ✅
7. **Council popup** - Distinct purple icon, "Report boundary issue" form ✅
8. **Controls** - Zoom to data, Refresh, Loading skeleton all functional ✅
9. **Performance** - No layout shift, clean build, no console errors ✅

### Deployment Status
- ✅ Replit autoscale configured
- ✅ Production build verified (npm run build passes)
- ✅ All spec acceptance criteria met
- ✅ Documentation complete (README.md, TESTING.md, ACCEPTANCE_TESTS.md)
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

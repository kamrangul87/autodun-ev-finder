# Autodun EV Finder - Replit Project

## Overview
EV charging station finder application for the UK, migrated from Vercel to Replit. Built with Next.js, React, Leaflet maps, and Open Charge Map API integration with live data and fallback system.

## Recent Changes
**2025-10-11: UX Polish Complete - UK Search Lock + Popup Stability ✅**

### Final Production-Ready Implementation
- ✅ **UK-biased geocoding** - All searches locked to UK (countrycodes=gb, bounded=1, viewbox), toast for non-UK places
- ✅ **Dynamic status banner** - Shows UK|Region|City based on search results (extractRegionName)
- ✅ **First render fix** - Map gates on initialDataReady, shows 4,377 stations immediately (no "2 stations" glitch)
- ✅ **Popup stability** - closeOnClick:false, autoClose:false, event propagation stopped, map locked when feedback open
- ✅ **Mobile scrim overlay** - Semi-transparent ::before pseudo-element blocks map interaction on feedback
- ✅ **Council optimization** - Point-in-polygon samples to 5k if >10k stations, extrapolates count, shows "Stations in boundary: N"
- ✅ **Map interaction control** - FeedbackForm disables dragging/scrollWheelZoom/boxZoom on mount, restores on unmount
- ✅ **Bbox/tiled API fetching** - Splits UK bounds into 4×4 tiles (500/tile) on first load, 2×2 tiles (750/tile) on pan/zoom
- ✅ **LRU cache** - Server-side cache with 200 entries, tile-based keys prevent redundant API calls
- ✅ **Acceptance tests** - All 15 MVP criteria verified (see MVP_ACCEPTANCE_TESTS.md)
- ✅ **Final architect review** - Approved with no blocking defects, production-ready

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

# Autodun EV Finder - Replit Project

## Overview
EV charging station finder application for the UK, migrated from Vercel to Replit. Built with Next.js, React, Leaflet maps, and Open Charge Map API integration with live data and fallback system.

## Recent Changes
**2025-10-11: Rebuilt Drawer Following User Specifications ✅**
- Complete drawer rebuild following exact user specifications
- Desktop (≥1024px): Fixed right-side panel (380px wide, height: calc(100vh - 70px), top: 70px)
- Mobile (<1024px): Bottom sheet (55vh height, rounded top corners, drag handle)
- Proper z-index layering: drawer at 9999, backdrop at 9998 (above map layers)
- Opaque white panel with shadow (0 10px 30px rgba(0,0,0,0.12))
- Sticky header (60px height, gray-50 background, border-bottom)
- Content order: Station name → Address → Connectors → Good/Bad buttons → Comment → Submit/Cancel → Directions
- Good button: green-50 bg, green-600 border; Bad button: red-50 bg, red-600 border
- Primary button: solid blue-600; Secondary: white with gray border
- Keyboard accessible: ESC closes, TAB cycles within drawer, focus trap
- No map re-centering or behavior changes
- Form resets on station change, closes after submission

**2025-10-11: Drawer UI + Geolocation + Telemetry Refactor ✅**

### Major Architectural Upgrade - Production Ready
- ✅ **Drawer UI System** - Replaced popups with StationDrawer (desktop: right-side panel at 380px, mobile: bottom sheet at 70vh)
- ✅ **Council Markers API** - /api/council-stations endpoint with bbox-based server-side aggregation, purple diamond markers
- ✅ **Geolocation System** - useGeolocation hook + LocateMeButton (top-right), blue dot marker + accuracy circle, auto-pan to location
- ✅ **Routing Integration** - "Get Directions" buttons in drawer (Google Maps on Android/Desktop, Apple Maps on iOS)
- ✅ **Production Telemetry** - logEvent utility with anonymized events (drawer_open, locate_me_clicked, council_selected, etc.), enabled in production
- ✅ **Fast Refresh Fix** - hasLoadedRef prevents duplicate fetches during hot reload, stable initial data load
- ✅ **Viewport Fetch Guard** - Enhanced ViewportFetcher only blocks initial bbox after stations loaded
- ✅ **Telemetry Events**:
  - drawer_open/close (stationId, isCouncil, durationMs)
  - feedback_submit (stationId, vote, hasComment)
  - route_clicked (stationId, provider)
  - council_selected (boroughHash, stationCount)
  - locate_me_clicked (granted)
  - toggle_layer (layer, visible)
- ✅ **Mobile UX** - Touch-optimized drawer, swipe gestures, responsive controls, large tap targets
- ✅ **Performance** - Verified caching, debouncing (400ms viewport fetch), lazy heatmap sampling (>25k points)
- ✅ **Final architect review** - Approved as production-ready, all tasks complete

**2025-10-11: UX Polish Complete - UK Search Lock + Popup Stability ✅** *(Previous implementation - now deprecated by drawer system)*

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
- ✅ GitHub CI/CD configured (.github/workflows/ci.yml, CODEOWNERS, scripts/push.sh)
- ✅ Documentation complete (README.md, TESTING.md, ACCEPTANCE_TESTS.md, IMPLEMENTATION_STATUS.md)
- ✅ Ready for publish

### CI/CD Workflow (GitHub Auto-Lock)
- **Branch Strategy**: Replit pushes to `develop` → PR to `main` → CI passes → Vercel deploys
- **CI Pipeline**: `.github/workflows/ci.yml` runs lint, build, test on all pushes/PRs
- **Code Review**: `.github/CODEOWNERS` requires @kamrangul87 approval on all changes
- **Helper Script**: `./scripts/push.sh [branch]` - pushes to develop (default) with commit message
- **Manual Setup Required**: Configure GitHub branch protection on `main` (requires PR, code owner review, CI checks)

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

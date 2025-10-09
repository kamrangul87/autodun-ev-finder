# Autodun EV Finder - Testing Guide

## Production Build Status
✅ **Build passes successfully** (tested 2025-10-09)

## Core Features Testing Checklist

### 1. Viewport-Driven Data Fetching ✅
- [x] Map loads stations based on current viewport
- [x] Debounced fetching (500ms) prevents API spam
- [x] Cache system (5min TTL) reduces redundant calls
- [x] Loading spinner shows during fetches
- [x] Up to 1000 stations per viewport
- [x] API calculates optimal radius from bounds

**Test Steps:**
1. Open map (should load ~1000 stations for London)
2. Pan to Manchester - new stations load
3. Zoom out - more stations appear
4. Pan back - cached data loads instantly

**Expected Console Log:**
```
[fetchStations] Attempting source: ocm (lat: X, lng: Y, radius: Zkm, max: 1000)
[fetchStations] Success: 1000 stations from OPENCHARGE
[handleFetchStations] Received data: 1000 stations from OPENCHARGE
```

### 2. Live OpenChargeMap Integration ✅
- [x] Fetches real UK charging stations
- [x] Uses OCM_API_KEY for authentication
- [x] Returns normalized station data
- [x] Fallback system: OPENCHARGE → STATIC → DEMO

**Test Steps:**
1. Check banner shows "Source: OPENCHARGE"
2. Verify station count > 0
3. Click marker - popup shows real station details

### 3. Interactive Map Visualization ✅
- [x] Heatmap toggle (red gradient overlay)
- [x] Markers toggle (clustered pins)
- [x] Council markers (centroid points with tooltips)
- [x] Zoom to data button
- [x] MarkerClusterGroup for 1000+ stations

**Test Steps:**
1. Enable Heatmap - red gradient appears
2. Enable Markers - clustered pins appear
3. Enable Council (5) - council centroid markers show
4. Click "Zoom to data" - fits all stations in view
5. Zoom in on cluster - expands to individual markers

### 4. Location Search ✅
- [x] Accepts UK postcodes (SW1A 1AA)
- [x] Uses postcodes.io API (primary)
- [x] Falls back to Nominatim
- [x] Pans map to location
- [x] Triggers viewport fetch for new area

**Test Steps:**
1. Enter "M1 1AE" (Manchester) - map pans north
2. Stations update for Manchester area
3. Banner shows new station count
4. Enter "EH1 1YZ" (Edinburgh) - map pans to Scotland

### 5. Station Feedback System ✅
- [x] Feedback form in station popup
- [x] Good/Bad selection
- [x] Optional comment (280 chars max)
- [x] Submit to /api/feedback
- [x] Success confirmation message
- [x] Auto-close after 2 seconds

**Test Steps:**
1. Click any station marker
2. Click "Feedback" button in popup
3. Select "👍 Good" or "👎 Bad"
4. Add comment (optional)
5. Click "Submit Feedback"
6. See "✓ Thanks for your feedback!" message
7. Popup closes after 2 seconds

**Expected API Log:**
```
[FEEDBACK] Station 12345 - good: "Fast charging, easy access" from 123.45.67.89
```

### 6. Council Boundary Display ✅
- [x] Shows councils as centroid markers
- [x] Tooltip with council name on hover
- [x] Clean UI (no polygon overlay)
- [x] 5 councils pre-loaded

**Test Steps:**
1. Enable "Council (5)" toggle
2. See 5 markers appear (different icon from stations)
3. Hover over marker - tooltip shows council name

### 7. Performance & UX ✅
- [x] Debounced move events (500ms)
- [x] Intelligent caching (prevents duplicate API calls)
- [x] Loading states (spinner during fetch)
- [x] MarkerClusterGroup (handles 1000+ markers)
- [x] Map renders at full viewport height
- [x] No console errors (except browser extension warnings)

## API Testing

### GET /api/stations
**Parameters:**
- `lat` (required): Latitude
- `lng` (required): Longitude  
- `radius` (required): Search radius in km
- `max` (optional): Max stations (default: 1000)

**Example:**
```
GET /api/stations?lat=51.5074&lng=-0.1278&radius=67&max=1000
```

**Response:**
```json
{
  "items": [...1000 stations],
  "count": 1000,
  "source": "OPENCHARGE",
  "center": {"lat": 51.5074, "lng": -0.1278},
  "fellBack": false
}
```

### POST /api/feedback
**Body:**
```json
{
  "stationId": "12345",
  "type": "good",
  "comment": "Fast charging",
  "timestamp": "2025-10-09T10:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Feedback recorded",
  "id": 123
}
```

## Environment Configuration

### Required Secrets
- `OCM_API_KEY`: OpenChargeMap API key ✅
- `STATIONS`: "ocm" or "OPENCHARGE" for live data ✅

### Optional Variables
- `NEXT_PUBLIC_TILE_URL`: Custom map tiles (default: OpenStreetMap)
- `COUNCIL_DATA_URL`: Custom council data URL

## Deployment Testing

### Replit Autoscale ✅
- Build: `npm run build` ✅
- Start: `npm run start`
- Port: 5000
- Mode: autoscale (stateless)

### Vercel Deployment
- Build command: `npm run build`
- Output directory: `.next`
- Install command: `npm install`
- Framework preset: Next.js

## Known Issues / Browser Warnings
1. ⚠️ `fdprocessedid` hydration warning - caused by browser extensions (not app code)
2. ⚠️ Cross-origin request warning - Next.js dev mode only (safe to ignore)
3. ⚠️ Invalid hook call - Fast Refresh issue during HMR (resolves automatically)

## Success Metrics
✅ Live data from OpenChargeMap (1000 stations)
✅ Viewport-driven fetching works across UK
✅ All toggles functional (heatmap, markers, council)
✅ Search works (postcodes → pan → fetch)
✅ Feedback system operational
✅ Production build successful
✅ Deployment configured for Replit & Vercel

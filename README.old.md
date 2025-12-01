# Autodun EV Finder

**Production-Ready MVP** - A viewport-driven EV charging station finder for the UK with live OpenChargeMap data, interactive maps, and user feedback.

## 🚀 Recent Updates (2025-10-09)

### Viewport-Driven Data Fetching
- **Dynamic loading**: Map fetches up to 1,000 stations based on current viewport bounds
- **Smart caching**: 5-minute TTL with debounced requests (500ms) prevents API spam  
- **Pagination**: Single request per viewport with max 1,000 results cap
- **Throttling**: Requests only fire after user stops panning/zooming
- **Auto-retry**: Failed requests don't permanently block; retries allowed

### Data Limits & Pagination
- **Max stations per viewport**: 1,000 (OpenChargeMap API limit)
- **Cache duration**: 5 minutes per viewport tile
- **Debounce delay**: 500ms after map movement
- **Deduplication**: By station ID across paginated results
- **Zoom scaling**: Adapts request radius to current zoom level

### Feedback System
- **Storage**: In-memory store (up to 1,000 entries, FIFO)
- **Fields logged**: `{stationId, type, comment, timestamp, ip, userAgent}`
- **Privacy**: IP/userAgent for spam prevention only (not persisted to disk)
- **Structure**: Good/Bad rating + optional 280-char comment
- **API**: `POST /api/feedback` with server-side validation

### Council Markers (Enhanced)
- **Visual distinction**: Purple diamond markers (vs blue station pins)
- **Interactive popups**: Show borough name + station count + "Zoom to borough" button
- **Polygon overlay**: Orange stroke with low fill opacity for boundaries
- **Dynamic counts**: Updates as viewport/stations change
- **Point-in-polygon**: Accurate station counting per council area

### Known Future Work
- **Rate limiting**: Add per-IP throttling for feedback endpoint
- **ML pipeline**: Aggregate feedback for station quality scoring  
- **Persistent storage**: Move feedback log from memory to disk/database (Replit persistent storage or PostgreSQL)
- **Advanced caching**: Redis/KV store for distributed caching across deployments
- **Error recovery**: Exponential backoff for failed API calls
- **Pagination UI**: Show "Load more" when viewport has 1,000+ potential stations
- **OCM rate limits**: Monitor and implement backoff strategy

---

## Quick Start

### Development
```bash
npm install
npm run dev
# Open http://localhost:5000
```

### Environment Variables
Required secrets (server-side only):
- `OCM_API_KEY` - OpenChargeMap API key for live data
- `STATIONS` - Data source: "ocm" or "OPENCHARGE" for live, "STATIC" for JSON, "DEMO" for sample

Optional:
- `NEXT_PUBLIC_TILE_URL` - Custom map tile server (default: OpenStreetMap)
- `COUNCIL_DATA_URL` - Custom council boundary data URL

### Production Build
```bash
npm run build
npm run start
```

## Features

### 🗺️ Interactive Map
- **Viewport-driven fetching**: Loads stations dynamically as you pan/zoom
- **Heatmap visualization**: Red gradient showing station density
- **Marker clustering**: MarkerClusterGroup handles 1,000+ stations efficiently
- **Council overlays**: Orange polygon boundaries with purple centroid markers
- **Stable layers**: No flicker or drift when toggling views

### 🔍 Location Search
- **UK postcode search**: Uses postcodes.io (primary) → Nominatim (fallback)
- **Auto-pan & fetch**: Centers map and loads nearby stations automatically
- **Persistent toggles**: Heatmap/Markers/Council state maintained during search
- **URL state**: Search query persisted in URL as `?q=SW1A1AA`

### 💬 User Feedback
- **Station-specific**: Click any marker → "Feedback" button in popup
- **Structured input**: Good/Bad rating + optional comment (280 chars)
- **Success toast**: "✓ Thanks for your feedback!" confirmation
- **Server logging**: Captured for future ML analysis

### 🏛️ Council Information
- **Distinct markers**: Purple diamonds at council centroids
- **Popup details**: 
  - Borough name
  - Live station count within boundary
  - "Zoom to borough" button (fits bounds to polygon)
- **Hover tooltips**: Quick borough name on hover

### ⚡ Performance
- **Debounced fetching**: 500ms delay prevents API spam
- **Intelligent caching**: 5-min TTL reduces redundant calls
- **Loading states**: Spinner during fetches, non-blocking
- **No freezing**: Handles 1,000+ stations at any zoom level
- **Bundle optimization**: Tree-shaking, code splitting, lazy loading

## API Endpoints

### GET /api/stations
Fetches charging stations for current viewport.

**Query Parameters:**
- `lat` (required) - Center latitude
- `lng` (required) - Center longitude  
- `radius` (required) - Search radius in km (calculated from viewport bounds)
- `max` (optional) - Max results (default: 1000)

**Response:**
```json
{
  "items": [
    {
      "id": "12345",
      "lat": 51.5074,
      "lng": -0.1278,
      "name": "Station Name",
      "address": "123 Street",
      "postcode": "SW1A 1AA",
      "connectors": 4,
      "source": "OPENCHARGE"
    }
  ],
  "count": 1000,
  "source": "OPENCHARGE",
  "center": {"lat": 51.5074, "lng": -0.1278},
  "fellBack": false
}
```

### POST /api/feedback
Submit user feedback for a charging station.

**Request Body:**
```json
{
  "stationId": "12345",
  "type": "good",
  "comment": "Fast charging, easy access",
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

## Architecture

- **Framework**: Next.js 14 (Pages Router)
- **UI**: React with Tailwind CSS
- **Maps**: Leaflet with react-leaflet, marker clustering, heatmap support
- **Data Source**: OpenChargeMap API (live) → Static JSON → Demo fallback
- **Deployment**: Replit autoscale & Vercel compatible
- **State Management**: URL params for toggles (heat, markers, council, q)

## Deployment

### Replit (Configured)
- **Build**: `npm run build`
- **Start**: `npm run start`  
- **Port**: 5000 (autoscale mode)
- **Secrets**: Set `OCM_API_KEY` and `STATIONS=ocm` in Replit Secrets

### Vercel
- **Import**: Connect GitHub repo
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Environment**: Add `OCM_API_KEY` in project settings
- **Framework**: Auto-detected (Next.js)

## QA Checklist ✅

- [x] Load app fresh → both heatmap + markers appear with 500-1000 points
- [x] Pan to Leeds/Manchester → new data loads, no flicker
- [x] Toggle heatmap off → markers stay stable, counts update  
- [x] Toggle council on → orange polygons + purple markers appear
- [x] Click council marker → popup shows name + count + Zoom button
- [x] Search "SW1A 1AA" → map centers, toggles persist, data refreshes
- [x] Click station → Feedback modal, submit Good + note, see toast
- [x] Reload page → URL state (toggles + query) restored
- [x] Production build → `npm run build` passes
- [x] Zero console errors in production preview

## Development Notes

### File Structure
```
autodun-ev-finder/
├── components/
│   ├── EnhancedMap.jsx          # Main map with viewport fetching
│   └── ...
├── pages/
│   ├── index.jsx                # Homepage with map
│   ├── api/
│   │   ├── stations.js          # Viewport-driven station API
│   │   └── feedback.js          # Feedback collection endpoint
├── lib/
│   ├── api-cache.js             # 5-min TTL caching layer
│   └── data-sources.js          # OCM/Static/Demo fallback logic
├── utils/
│   ├── map-utils.js             # Viewport calculation helpers
│   └── url-state.js             # URL param persistence
├── public/
│   └── data/
│       └── static-stations.json # Fallback station data
└── TESTING.md                   # Comprehensive test guide
```

### Key Implementation Details
- **Viewport calculation**: `calculateBoundsRadius()` computes optimal search radius from map bounds
- **Cache keys**: Format `lat-lng-radius` for 5-min TTL deduplication
- **Polygon containment**: Ray-casting algorithm for point-in-polygon station counts
- **Failed request recovery**: `lastFetchRef` reset on error allows retries

## Contributing

This is a production MVP. Future enhancements welcome:
- Rate limiting & abuse prevention
- ML-based station quality scoring from feedback
- Persistent feedback storage (PostgreSQL/Supabase)
- Advanced filtering (connector type, power level, network)
- Route planning with multi-stop charging

## License

MIT - See LICENSE file for details

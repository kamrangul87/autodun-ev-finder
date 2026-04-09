<p align="center">
  <strong>⚡ Autodun EV Finder</strong><br/>
  <em>Real-time UK EV charging intelligence — map, score, and analyse 30,000+ charge points with machine learning</em>
</p>

<p align="center">
  <a href="https://ev.autodun.com"><img alt="Live Demo" src="https://img.shields.io/badge/Live_Demo-ev.autodun.com-00e5a0?style=for-the-badge&logo=vercel&logoColor=white"/></a>
</p>

<p align="center">
  <img alt="Next.js 14" src="https://img.shields.io/badge/Next.js-14-black?logo=next.js"/>
  <img alt="React 18" src="https://img.shields.io/badge/React-18-61dafb?logo=react"/>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white"/>
  <img alt="Leaflet" src="https://img.shields.io/badge/Leaflet-1.9.4-199900?logo=leaflet"/>
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase&logoColor=white"/>
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-3.3-06b6d4?logo=tailwindcss&logoColor=white"/>
  <img alt="Node" src="https://img.shields.io/badge/Node-20.x-339933?logo=node.js&logoColor=white"/>
  <img alt="License" src="https://img.shields.io/badge/License-MIT-yellow"/>
</p>

---

## What is this?

Autodun EV Finder is a production Next.js application that aggregates live UK electric vehicle charging data from [OpenChargeMap](https://openchargemap.org/), overlays UK local authority boundaries, collects real driver feedback, and runs a nightly machine learning pipeline to score every station for reliability and suitability.

It ships three interfaces:

| Interface | Path | Purpose |
|-----------|------|---------|
| **Public map** | `/` | Interactive Leaflet map with heatmap, marker clustering, postcode search, AI score drawer |
| **Council dashboard** | `/ev-charging-council-dashboard` | Marketing page for UK local authorities — explains the data product |
| **Admin dashboard** | `/admin/feedback` | Protected analytics — feedback trends, ML metrics, CSV export, council overlay |

**[Try the live demo &rarr;](https://ev.autodun.com)**

---

## Features

### Interactive EV Map

The map renders 30,000+ charge points across the UK using **React-Leaflet** with `react-leaflet-cluster` for performant marker clustering (`maxClusterRadius: 60`, unclusters at zoom 16). Three toggleable layers:

- **Markers** — individual station pins, click to open the detail drawer
- **Heatmap** — `leaflet.heat` density overlay with adaptive radius based on zoom level; auto-downsamples above 25k points
- **Council** — purple diamond markers for council-sourced charging stations fetched from `/api/council-stations`

Search uses a two-stage geocoder: **postcodes.io** for UK postcodes, with **Nominatim** (UK-biased viewport) as fallback.

### AI Suitability Scoring

Every station receives a 0–1 suitability score from a lightweight linear model trained nightly on real feedback data:

```
score = w·power_kw + w·n_connectors + w·has_fast_dc + w·rating + w·has_geo + bias
```

The model file (`ml/model.json`) contains learned weights and normalization caps. The scoring API (`/api/score`) runs the prediction server-side with:

- **30-minute LRU-TTL cache** (800 entries) to avoid recomputation
- **IP rate limiting** (60 req/min) to prevent abuse
- **Optional Supabase persistence** for audit trails
- **Client-side localStorage cache** (30 min) to reduce network calls

Scores render in the station drawer as a circular SVG progress ring with color coding: green (≥75%), amber (50–74%), red (<50%).

### ML Training Pipeline

A **GitHub Actions** workflow (`.github/workflows/train-ml.yml`) runs nightly at 02:30 UTC:

1. Pulls recent feedback from Supabase
2. Trains a weighted linear model using Python + NumPy
3. Logs accuracy, precision, and recall to the `ml_runs` table
4. Commits the updated `ml/model.json` back to `main`

Training metrics are visible at `/ml-status` (public) and `/admin/ml` (detailed admin view with accuracy-over-time charts).

### Admin Feedback Dashboard

Protected admin panel at `/admin/feedback` with:

- Summary KPI tiles (total / good / bad / today / avg ML score)
- Multi-axis filtering: sentiment, score range, date range, free text, model version, data source
- Timeline bar chart and compact distribution charts (sentiment split, ML score histogram, source breakdown)
- Council overlay map showing feedback marker locations
- Paginated feedback table with full detail
- One-click CSV export for offline analysis

### Council Boundary Integration

Council data is sourced from Supabase (PostGIS) with boundary polygons and centroids for every UK local authority. API endpoints:

- `/api/council` — lookup council by point coordinates or ID
- `/api/council-stations` — return charging stations clipped to a council polygon's bounding box
- `/api/cron/council-refresh` — warm endpoint for cron-based cache priming

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ index.jsx│  │EnhancedMapV2 │  │   StationDrawer.tsx    │ │
│  │  (page)  │──│  (Leaflet)   │──│  (AI score, feedback)  │ │
│  └────┬─────┘  └──────┬───────┘  └──────────┬─────────────┘ │
│       │               │                      │               │
│  URL state      viewport bbox          POST /api/feedback    │
│  management     triggers fetch         POST /api/score       │
└───────┼───────────────┼──────────────────────┼───────────────┘
        │               │                      │
┌───────▼───────────────▼──────────────────────▼───────────────┐
│                   Next.js API Routes                         │
│                                                              │
│  /api/stations ──── OpenChargeMap API (GB, tiled bbox)       │
│  /api/council  ──── Supabase PostGIS (boundaries, centroids) │
│  /api/score    ──── ml/scorer.ts (local linear model)        │
│  /api/feedback ──── Supabase (feedback table, insert)        │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                     Data Layer                                │
│                                                              │
│  OpenChargeMap API ─── 30k+ GB stations (live, bbox queries) │
│  Supabase/PostGIS ──── feedback, ml_runs, council boundaries │
│  ml/model.json ──────── trained weights (nightly via GH CI)  │
│  postcodes.io ─────── UK postcode → lat/lng geocoding        │
└──────────────────────────────────────────────────────────────┘
```

**Data flow:** The map fires a `moveend` event (debounced 800ms, gated to zoom ≥ 10). `ViewportFetcher` computes the viewport bounding box, checks the client-side LRU cache, and calls `/api/stations?bbox=...&tiles=N`. The API route splits the bbox into tiles, fetches each from OpenChargeMap in parallel, normalizes connector data, and returns GeoJSON. Station features are enriched with AI scores via concurrent `/api/score` POST calls (3 workers, 25 per batch). Results are cached at both the API layer (`s-maxage=300`) and client (`api-cache.js` with `getCached`/`setCache`).

---

## Getting Started

### Prerequisites

- **Node.js** 20.x
- **npm** 9+
- An [OpenChargeMap API key](https://openchargemap.org/site/develop/api) (free)
- A [Supabase](https://supabase.com/) project (free tier works)

### Install

```bash
git clone https://github.com/kamrangul87/autodun-ev-finder.git
cd autodun-ev-finder
npm install
```

### Configure

Create a `.env.local` file in the project root:

```env
# OpenChargeMap
OCM_API_KEY=your_openchargemap_api_key_here

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# AI Scorer (set to "true" to enable ML scoring)
NEXT_PUBLIC_SCORER_ENABLED=true

# Optional: custom tile server
# NEXT_PUBLIC_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

### Run

```bash
# Development (port 5000)
npm run dev

# Production build
npm run build
npm start

# Lint
npm run lint
```

Open [http://localhost:5000](http://localhost:5000) to see the map.

---

## Project Structure

```
autodun-ev-finder/
├── pages/
│   ├── index.jsx                         # Main map page
│   ├── ml-status.tsx                     # Public ML metrics
│   ├── ev-charging-council-dashboard.tsx # Council landing page
│   ├── about-ai.tsx                      # AI explainer page
│   ├── privacy.tsx                       # Privacy policy
│   ├── admin/
│   │   ├── feedback.tsx                  # Admin feedback dashboard
│   │   └── ml.tsx                        # Admin ML dashboard
│   └── api/
│       ├── stations.js                   # Station data (OCM + fallbacks)
│       ├── score.ts                      # AI scoring endpoint
│       ├── feedback.js                   # Feedback submission
│       ├── council.ts                    # Council boundary lookup
│       ├── council-stations.ts           # Council-scoped stations
│       └── cron/                         # Scheduled jobs
├── components/
│   ├── EnhancedMapV2.jsx                # Main Leaflet map component
│   ├── StationDrawer.tsx                # Station detail panel + AI score ring
│   ├── LocateMeButton.tsx               # Geolocation control
│   ├── SearchBox.tsx                    # Postcode search
│   └── admin/                           # Admin dashboard components
├── ml/
│   ├── train.py                         # Nightly training script (Python)
│   ├── scorer.ts                        # Server-side model inference
│   ├── model.json                       # Trained model weights
│   └── training_data.csv                # Training dataset
├── lib/
│   ├── data-sources.js                  # OCM / static / demo data fetchers
│   ├── api-cache.js                     # Client-side LRU cache
│   ├── postcode-search.js              # Geocoding (postcodes.io + Nominatim)
│   ├── supabaseAdmin.ts                # Supabase service role client
│   ├── model1.ts                       # Feature extraction + scoring logic
│   └── viewportScorer.ts              # Batched viewport AI scoring
├── utils/
│   ├── haversine.ts                    # Distance calculations
│   ├── geo.ts                          # Bbox parsing + UK bounds
│   ├── telemetry.ts                    # Event tracking
│   └── url-state.js                    # URL ↔ state sync
├── .github/workflows/
│   ├── ci.yml                          # Build + lint on push/PR
│   ├── train-ml.yml                    # Nightly ML training
│   └── ev-ingest.yml                   # EV data ingestion
└── public/                             # Static assets
```

---

## Screenshots

| Map View | Station Drawer | Admin Dashboard |
|----------|---------------|-----------------|
| ![EV Map with heatmap and station clusters](docs/screenshots/map-view.png) | ![Station detail with AI score ring](docs/screenshots/station-drawer.png) | ![Admin feedback analytics](docs/screenshots/admin-dashboard.png) |

> Screenshots not included in repo yet. Contribute by adding them to `docs/screenshots/`.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OCM_API_KEY` | Yes | OpenChargeMap API key for live station data |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `NEXT_PUBLIC_SCORER_ENABLED` | No | Set to `"true"` to enable ML scoring (defaults to fallback score) |
| `NEXT_PUBLIC_TILE_URL` | No | Custom map tile server URL |

---

## Deployment

The app deploys automatically to [Vercel](https://vercel.com) on every push to `main`. The production instance runs at **[ev.autodun.com](https://ev.autodun.com)**.

```bash
# Manual deploy via Vercel CLI
npx vercel --prod
```

Ensure all environment variables are configured in your Vercel project settings.

---

## Contributing

Contributions are welcome. Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Write clear commit messages
4. Ensure `npm run build` and `npm run lint` pass
5. Open a pull request against `main`

### Areas where help is needed

- Improving ML model accuracy with more training features
- Adding connector-type filtering on the map
- Accessibility improvements (WCAG AA compliance)
- Unit and integration test coverage
- Mobile PWA enhancements

---

## License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built by <strong><a href="https://autodun.com">Autodun</a></strong> · A product of <strong>MINSO LTD</strong><br/>
  <sub>Helping UK councils and drivers make smarter EV charging decisions</sub>
</p>

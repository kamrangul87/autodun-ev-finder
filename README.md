# Autodun EV Finder

Autodun EV Finder is a lightweight EV charging analytics dashboard for **UK councils and transport teams**.

The platform combines:

- **OpenChargeMap live data** – public charge point locations and attributes.
- **Council boundary data** – polygons and centroids for every UK local authority.
- **Real driver feedback** – simple “good / bad” ratings submitted via the public map.
- **Nightly machine learning model** – scores EV charging sites for reliability and suitability.

Live demo: **https://ev.autodun.com**

---

## Key features

### 🗺 Public EV map

- UK-wide EV charging map using **live OpenChargeMap data**  
- Postcode search (postcodes.io → Nominatim fallback)  
- Heatmap + marker view with council overlay  
- View per-station details (name, address, connectors, source)  
- Drawer UI with **AI score**, suitability description and feedback form  

### 🏛 Council dashboard

Marketing / info page for councils:

- `/ev-charging-council-dashboard`
- Explains heatmap by council, driver feedback and ML scoring
- Buttons to:
  - **View map demo**
  - **View ML model status**
  - **Request council demo** (mailto link)

### 📊 Admin dashboard

Admin feedback dashboard at `/admin/feedback` (basic auth):

- Summary tiles (total / good / bad / today / avg ML)
- Filters: sentiment, score range, date range, search, model, source
- Timeline chart (bars) + compact charts (sentiment, ML score, source mix)
- Council overlay map with feedback markers
- Paginated latest feedback table
- Export CSV for offline analysis

### 🤖 ML training status

ML status page at `/admin/ml` and public summary at `/ml-status`:

- Current model version (e.g. `v2-manual`)
- Last training run timestamp
- Accuracy, precision, recall (from Supabase `ml_runs` table)
- Table of recent training runs
- Graph of model accuracy over time

Nightly retraining is handled by **GitHub Actions** (`.github/workflows/train-ml.yml`) and logs metrics back into Supabase.

---

## Data sources

### Charging stations

Stations are fetched via `/api/stations`:

- Primary source: **OpenChargeMap (GB)**  
- Optional static / custom URL fallbacks  
- Normalised fields:
  - `id`, `lat`, `lng`
  - `name`, `address`, `postcode`
  - `connectors` (count)
  - `connectorsDetailed` (types, power, quantity)
  - `source` (e.g. `OPENCHARGE`, `STATIC`, `DEMO`, `CUSTOM`)

The map can also use **tiled bounding-box fetching** for large areas.

### Councils

Council data is stored in Supabase:

- Council polygons table (GeoJSON)  
- Council centroids table for fast lookup  
- `/api/council` – lookup by point or id  
- `/api/council-stations` – returns stations clipped to a council polygon  
- `/api/cron/council-refresh` – helper to warm council endpoints (used by cron)

### Feedback & ML

- Feedback is stored in Supabase (`feedback` table) via `/api/feedback`  
- ML runs are logged in `ml_runs` (samples used, accuracy, precision, recall, notes)  
- Model training runs as a nightly GitHub Action using Supabase service role key.

---

## Tech stack

- **Framework:** Next.js 14 (pages router)
- **Language:** TypeScript + React
- **Map:** React-Leaflet, Leaflet
- **Backend:** Next.js API routes (Node 20.x)
- **Database:** Supabase (PostgreSQL + realtime)
- **ML:** Python pipeline launched via GitHub Actions
- **Hosting:** Vercel (`main` branch → production)

---

## Getting started

### 1. Install dependencies

```bash
npm install

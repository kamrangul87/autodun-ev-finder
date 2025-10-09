# Autodun EV Finder - Replit Project

## Overview
EV charging station finder application for the UK, migrated from Vercel to Replit. Built with Next.js, React, Leaflet maps, and Open Charge Map API integration.

## Recent Changes
**2025-10-09: Vercel to Replit Migration**
- Configured Next.js to run on port 5000 with host 0.0.0.0 for Replit compatibility
- Set up environment variables (OCM_API_KEY, STATIONS) via Replit Secrets
- Restored Map.jsx component with correct props for pages router compatibility
- Configured development workflow and deployment settings
- Documented environment variables in .env.example

## Project Architecture
- **Framework**: Next.js 14 (Pages Router)
- **UI**: React with Tailwind CSS
- **Maps**: Leaflet with react-leaflet, marker clustering, and heatmap support
- **Data Source**: Open Charge Map API for EV station data
- **Deployment**: Configured for Replit autoscale deployment

## Environment Configuration
### Required Secrets (configured in Replit Secrets)
- `OCM_API_KEY`: Open Charge Map API key for fetching station data
- `STATIONS`: Data source mode (DEMO, OPENCHARGE, STATIC)

### Optional Variables (see .env.example)
- `COUNCIL_DATA_URL`: Custom URL for council boundary data
- `NEXT_PUBLIC_TILE_URL`: Custom map tile server URL

## Development
- **Dev Server**: Runs on port 5000 via `npm run dev`
- **Build**: `npm run build`
- **Production**: `npm run start`

## Deployment
Configured for Replit autoscale deployment:
- Build command: `npm run build`
- Start command: `npm run start`
- Port: 5000 (automatically exposed by Replit)

# Vercel Deployment Guide

## Environment Variables

The `/api/stations` route is configured for **runtime-dynamic** rendering on Vercel with **no caching**. You must set the following environment variables in your Vercel dashboard.

### Required Variables

Set these in **Project Settings → Environment Variables** for both **Preview** and **Production**:

| Variable | Value | Description |
|----------|-------|-------------|
| `STATIONS_SOURCE` | `OPENCHARGE` | Data source mode (OPENCHARGE for live OCM data) |
| `OCM_API_KEY` | `your_api_key` | Your OpenChargeMap API key |

### Optional Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `OCM_CLIENT` | `autodun-ev-finder` | Client identifier for OCM API tracking/analytics |
| `NEXT_PUBLIC_TILE_URL` | (custom URL) | Override default OpenStreetMap tiles |
| `COUNCIL_DATA_URL` | (custom URL) | Override default council boundary data |

## Configuration Details

### Runtime Dynamic API
The `/api/stations` endpoint is configured with:

```javascript
export const dynamic = 'force-dynamic';
export const config = { runtime: 'nodejs' };
```

### No Caching Policy
- **Response Headers**: `Cache-Control: no-store, no-cache, must-revalidate`
- **Fetch Options**: `cache: 'no-store'` on all OCM API requests
- **Result**: Always fresh data, no stale responses

### API Request Parameters
- **Default maxresults**: 1000 (OCM API limit)
- **Default radius**: 50km (or viewport-calculated)
- **Country**: GB (UK only)
- **Distance unit**: KM

## Deployment Steps

1. **Verify Environment Variables**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add `STATIONS_SOURCE=OPENCHARGE` for **both** Preview and Production
   - Add `OCM_API_KEY=<your_key>` for **both** Preview and Production
   - (Optional) Add `OCM_CLIENT=autodun-ev-finder`

2. **Push to GitHub**
   ```bash
   git add .
   git commit -m "feat: runtime-dynamic /api/stations with STATIONS_SOURCE env"
   git push origin main
   ```

3. **Trigger Deployment**
   - Vercel will auto-deploy on git push
   - Or manually redeploy: Deployments → [...] → Redeploy

4. **Verify Deployment**
   - Check deployment logs for successful build
   - Visit: `https://your-app.vercel.app/`
   - Confirm "Source: OPENCHARGE" displays (not "Using DEMO data")
   - Test viewport fetching by panning map

## Troubleshooting

### "Using DEMO data" banner shows
- Check that `STATIONS_SOURCE=OPENCHARGE` is set correctly
- Verify `OCM_API_KEY` is valid and not expired
- Check Vercel deployment logs for API errors

### API returns < 1000 stations
- This is expected if viewport area has fewer stations
- Zoom out to see more stations loaded
- Check OCM API status at https://openchargemap.org

### Stale data appears
- Confirm no CDN/proxy caching is enabled
- Check browser dev tools → Network → Response headers
- Should see: `Cache-Control: no-store, no-cache`

## Replit vs Vercel Environment Variables

| Replit | Vercel | Purpose |
|--------|--------|---------|
| `STATIONS` | `STATIONS_SOURCE` | Data source mode |
| `OCM_API_KEY` | `OCM_API_KEY` | OpenChargeMap API key |
| N/A | `OCM_CLIENT` | Client identifier (optional) |

The code checks `STATIONS_SOURCE` first (Vercel), then falls back to `STATIONS` (Replit), ensuring compatibility with both platforms.

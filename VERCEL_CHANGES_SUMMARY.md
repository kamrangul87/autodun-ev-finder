# Vercel Runtime-Dynamic API Changes Summary

## 🎯 Changes Completed

### 1. **Runtime-Dynamic API Configuration** (`pages/api/stations.js`)
- ✅ Added `export const dynamic = 'force-dynamic'` for Vercel
- ✅ Added `export const config = { runtime: 'nodejs' }`
- ✅ Changed default `maxresults` from 500 → **1000**
- ✅ Disabled HTTP caching with headers:
  - `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`
  - `Pragma: no-cache`
  - `Expires: 0`

### 2. **Environment Variable Support** (`lib/data-sources.js`)
- ✅ Now checks `STATIONS_SOURCE` (Vercel) first, then `STATIONS` (Replit)
- ✅ Added `OCM_CLIENT` support for API tracking
- ✅ Updated `fetchOpenCharge()` to accept `clientId` parameter
- ✅ Added `cache: 'no-store'` to fetch requests
- ✅ Sends `X-API-Client` header when `OCM_CLIENT` is set
- ✅ Default `maxResults` increased to 1000

### 3. **Documentation Created**
- ✅ **VERCEL_DEPLOYMENT.md** - Complete Vercel deployment guide
- ✅ **ACCEPTANCE_TESTS.md** - Spec compliance documentation  
- ✅ **.env.example** - Updated with Vercel-specific variables
- ✅ **This summary** - Quick reference for changes

### 4. **Visual Improvements** (from earlier spec work)
- ✅ Zoom-aware heatmap (green→yellow→orange→red gradient)
- ✅ Blue cluster styling with white text
- ✅ Dashed orange council boundaries
- ✅ Legend in bottom-right
- ✅ Loading skeleton in bottom-left

## 📋 Files Modified

1. `pages/api/stations.js` - Runtime-dynamic config + no caching
2. `lib/data-sources.js` - STATIONS_SOURCE support + OCM_CLIENT
3. `.env.example` - Vercel environment variable documentation
4. `VERCEL_DEPLOYMENT.md` - New deployment guide
5. `ACCEPTANCE_TESTS.md` - Spec compliance checklist
6. `components/EnhancedMap.jsx` - Visual enhancements (from spec)
7. `styles/globals.css` - Cluster styling
8. `replit.md` - Updated with final implementation details

## 🚀 Git Commands to Run

```bash
# Stage all changes
git add .

# Commit with descriptive message
git commit -m "feat: runtime-dynamic /api/stations for Vercel with STATIONS_SOURCE env

- Add export const dynamic = 'force-dynamic' to disable static caching
- Support STATIONS_SOURCE env (Vercel) and STATIONS (Replit)
- Add OCM_CLIENT support for API tracking (X-API-Client header)
- Increase default maxresults from 500 to 1000
- Disable all HTTP and fetch caching (no-store, no-cache)
- Add VERCEL_DEPLOYMENT.md with setup guide
- Add ACCEPTANCE_TESTS.md with spec compliance checklist
- Update .env.example with Vercel-specific variables

Breaking changes: API now defaults to 1000 results instead of 500"

# Push to GitHub
git push origin main
```

## ✅ Vercel Environment Variables to Set

After pushing to GitHub, set these in **Vercel Dashboard → Settings → Environment Variables** for both **Preview** and **Production**:

| Variable | Value | Required |
|----------|-------|----------|
| `STATIONS_SOURCE` | `OPENCHARGE` | ✅ Yes |
| `OCM_API_KEY` | `<your_key>` | ✅ Yes |
| `OCM_CLIENT` | `autodun-ev-finder` | Optional |

## 🧪 Verification Checklist

After Vercel deployment:

1. **Check Live Data Source**
   - Visit: `https://your-app.vercel.app/`
   - Should NOT show red "Using DEMO data" banner
   - UI should display "Source: OPENCHARGE" in footer

2. **Test Viewport Fetching**
   - Pan map to different UK cities
   - Should load ~1000 stations per viewport
   - Check browser dev tools → Network → `/api/stations`
   - Response headers should show: `Cache-Control: no-store, no-cache`

3. **Verify Request Parameters**
   - Network tab → `/api/stations` request
   - Should include: `maxresults=1000`, `radius=<calculated>`, `countrycode=GB`

4. **Check Deployment Logs**
   - Vercel Dashboard → Deployments → Latest → Function Logs
   - Look for: `[fetchStations] Success: 1000 stations from OPENCHARGE`

## 📊 Expected Behavior

### Before (with DEMO data):
- ❌ Red banner: "Using DEMO data"
- ❌ Only 5 hardcoded stations
- ❌ Static/cached responses

### After (with STATIONS_SOURCE=OPENCHARGE):
- ✅ No red banner
- ✅ Up to 1000 live stations per viewport
- ✅ Dynamic, always-fresh data
- ✅ Footer shows: "Source: OPENCHARGE • Stations: 1000"

## 🔍 Troubleshooting

**Issue: Still shows "Using DEMO data"**
- Solution: Verify `STATIONS_SOURCE=OPENCHARGE` is set in Vercel for the deployment environment (Preview or Production)
- Check: Deployment logs for `[fetchStations]` messages

**Issue: API returns < 1000 stations**
- This is normal if the viewport has fewer stations
- Zoom out to city level to see more stations

**Issue: Stale data persists**
- Unlikely with `no-store` headers, but check:
  - Browser cache disabled in dev tools
  - No CDN/proxy caching enabled
  - Vercel deployment is latest commit

## 📁 Next Steps

1. Run the git commands above to commit and push
2. Set environment variables in Vercel Dashboard
3. Redeploy on Vercel (auto-triggers on push)
4. Verify using the checklist above
5. Share live Vercel URL for testing

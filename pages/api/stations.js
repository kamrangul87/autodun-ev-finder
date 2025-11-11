// pages/api/stations.js
import { fetchStations, fetchTiledStations } from '../../lib/data-sources';
import { parseBBox, UK_BOUNDS } from '../../utils/geo.ts';

// Force dynamic rendering on Vercel - no static caching
export const config = { runtime: 'nodejs' };
export const dynamic = 'force-dynamic';

// helper
function inBbox(lat, lng, b) {
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const bboxParam = req.query.bbox;
    const tiles = req.query.tiles ? parseInt(req.query.tiles) : 3;
    const limitPerTile = req.query.limitPerTile ? parseInt(req.query.limitPerTile) : 500;
    const src = req.query.src || null;

    let result;

    /* ───────────── mode: bbox ───────────── */
    if (bboxParam) {
      const bbox = parseBBox(bboxParam) || UK_BOUNDS;
      result = await fetchTiledStations(bbox, tiles, limitPerTile, src);

      // 🔹 lightweight bbox filter (keep original design)
      if (result?.items?.length) {
        result.items = result.items.filter((r) => {
          const lat = Number(r.lat ?? r.Latitude);
          const lng = Number(r.lng ?? r.Longitude);
          return Number.isFinite(lat) && Number.isFinite(lng) && inBbox(lat, lng, bbox);
        });
      }

      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      return res.status(200).json({
        features: result.items.map(item => ({
          type: 'Feature',
          properties: item,
          geometry: { type: 'Point', coordinates: [item.lng, item.lat] }
        })),
        count: result.count,
        source: result.source,
        bbox: result.bbox || bbox,
        tiles: result.tiles,
        timestamp: new Date().toISOString()
      });
    }

    /* ───────────── default mode (lat/lng search) ───────────── */
    const lat = req.query.lat ? parseFloat(req.query.lat) : 51.5074;
    const lng = req.query.lng ? parseFloat(req.query.lng) : -0.1278;
    const distance = req.query.distance ? parseFloat(req.query.distance) : 50;
    const radius = req.query.radius ? parseFloat(req.query.radius) : distance;
    const max = req.query.max ? parseInt(req.query.max) : 1000;

    result = await fetchStations(lat, lng, radius, src, max);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(200).json({
      items: result.items,
      count: result.count,
      source: result.source,
      fellBack: result.fellBack || false,
      originalSource: result.originalSource,
      center: { lat, lng },
      radius,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API /stations] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch stations',
      message: error.message,
      items: [],
      count: 0
    });
  }
}

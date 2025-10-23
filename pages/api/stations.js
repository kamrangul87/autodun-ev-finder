// pages/api/stations.js
import { fetchStations, fetchTiledStations } from '../../lib/data-sources';
import { parseBBox, UK_BOUNDS } from '../../utils/geo.ts';

// Force dynamic rendering on Vercel - no static caching
export const config = {
  runtime: 'nodejs',
};

export const dynamic = 'force-dynamic';

/* ─────────────────────────────
   Normalizers (inlined)
   ───────────────────────────── */

// Map a few common OCM ConnectionType IDs directly to legend labels
const ID_TO_LABEL = {
  33: 'CCS',     // IEC 62196-3 Type 2 Combo
  32: 'CCS',     // Type 1 Combo → bucket with CCS
  2:  'CHAdeMO',
  25: 'Type 2',
};

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(+v)) return +v;
  return undefined;
}

function canonicalize(raw) {
  if (!raw || typeof raw !== 'string') return 'Unknown';
  const t = raw.toLowerCase();
  if (t.includes('ccs') || t.includes('combo')) return 'CCS';
  if (t.includes('chademo')) return 'CHAdeMO';
  if (t.includes('type 2') || t.includes('type-2') || t.includes('mennekes')) return 'Type 2';
  if (t.includes('iec 62196') && t.includes('type 2')) return 'Type 2';
  return 'Unknown';
}

/** Convert OpenChargeMap Connections[] → connectors[] our UI expects */
function mapOCMConnectionsToConnectors(connections) {
  if (!Array.isArray(connections) || connections.length === 0) return [];

  const out = [];
  for (const c of connections) {
    const id = toNum(c?.ConnectionTypeID) ?? toNum(c?.ConnectionType?.ID);
    const mappedById = id != null ? ID_TO_LABEL[id] : undefined;

    const title =
      c?.ConnectionType?.Title ??
      c?.ConnectionType?.FormalName ??
      c?.CurrentType?.Title ??
      c?.Level?.Title;

    const type = mappedById ?? canonicalize(title);
    const quantity = typeof c?.Quantity === 'number' && c.Quantity > 0 ? c.Quantity : 1;
    const powerKW = typeof c?.PowerKW === 'number' ? c.PowerKW : undefined;

    // Only push known types; unknown will fall back elsewhere when needed
    if (type !== 'Unknown') out.push({ type, quantity, powerKW });
  }
  return out;
}

/** Ensure each station item has a normalized `connectors` array */
function ensureNormalizedConnectors(item) {
  try {
    if (Array.isArray(item?.connectors) && item.connectors.length > 0) {
      return item; // already normalized
    }
    // Common OCM shape has `Connections` on the properties object we pass through
    const connections = item?.Connections ?? item?.properties?.Connections;
    const mapped = mapOCMConnectionsToConnectors(connections);
    if (mapped.length > 0) {
      return { ...item, connectors: mapped };
    }
  } catch (_) {
    // swallow – we keep item as-is if mapping fails
  }
  return item;
}

/* ─────────────────────────────
   API handler
   ───────────────────────────── */

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

    if (bboxParam) {
      const bbox = parseBBox(bboxParam) || UK_BOUNDS;
      result = await fetchTiledStations(bbox, tiles, limitPerTile, src);

      // 🔧 Normalize connectors for each item (OCM → connectors[])
      const normalizedItems = (result.items || []).map(ensureNormalizedConnectors);

      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

      return res.status(200).json({
        features: normalizedItems.map(item => ({
          type: 'Feature',
          properties: item,
          geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
        })),
        count: result.count,
        source: result.source,
        bbox: result.bbox,
        tiles: result.tiles,
        timestamp: new Date().toISOString(),
      });
    } else {
      const lat = req.query.lat ? parseFloat(req.query.lat) : 51.5074;
      const lng = req.query.lng ? parseFloat(req.query.lng) : -0.1278;
      const distance = req.query.distance ? parseFloat(req.query.distance) : 50;
      const radius = req.query.radius ? parseFloat(req.query.radius) : distance;
      const max = req.query.max ? parseInt(req.query.max) : 1000;

      result = await fetchStations(lat, lng, radius, src, max);

      // 🔧 Normalize here too for the radius/nearby endpoint
      const normalizedItems = (result.items || []).map(ensureNormalizedConnectors);

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      return res.status(200).json({
        items: normalizedItems,
        count: result.count,
        source: result.source,
        fellBack: result.fellBack || false,
        originalSource: result.originalSource,
        center: { lat, lng },
        radius,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('[API /stations] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch stations',
      message: error.message,
      items: [],
      count: 0,
    });
  }
}

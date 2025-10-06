
export const runtime = 'nodejs';
import { fetchStationsOCM } from '../../../lib/stations/providers/opencharge';
import type { Station } from '../../../types/stations';

// Simple in-memory LRU cache
const lru = new Map<string, { items: Station[]; ts: number }>();
const LRU_SIZE = 50;

function getCacheKey(params: URLSearchParams) {
  if (params.has('bbox')) {
    return `bbox:${params.get('bbox')}`;
  }
  if (params.has('lat') && params.has('lng') && params.has('radius')) {
    // Round coords for cache key
    const lat = Number(params.get('lat')).toFixed(3);
    const lng = Number(params.get('lng')).toFixed(3);
    const radius = params.get('radius');
    return `center:${lat},${lng},${radius}`;
  }
  return 'default';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  let items: Station[] = [];
  let source = 'OPENCHARGEMAP';
  let cacheKey = getCacheKey(params);
  let max = Math.min(Number(params.get('max')) || 200, 200);
  let bbox: [[number, number], [number, number]] | undefined;
  let lat: number | undefined;
  let lng: number | undefined;
  let radius: number | undefined;

  if (params.has('bbox')) {
    // Parse bbox=(south,west),(north,east)
    const m = params.get('bbox')?.match(/\(([^,]+),([^\)]+)\),\(([^,]+),([^\)]+)\)/);
    if (m) {
      bbox = [
        [parseFloat(m[1]), parseFloat(m[2])],
        [parseFloat(m[3]), parseFloat(m[4])],
      ];
    }
  } else if (params.has('lat') && params.has('lng') && params.has('radius')) {
    lat = parseFloat(params.get('lat')!);
    lng = parseFloat(params.get('lng')!);
    radius = parseFloat(params.get('radius')!);
  }

  // Caching
  if (bbox) {
    // 5 min cache for bbox
    const cached = lru.get(cacheKey);
    if (cached && Date.now() - cached.ts < 300_000) {
      items = cached.items;
      source = 'OPENCHARGEMAP_CACHED';
    } else {
      items = await fetchStationsOCM({ bbox, max });
      lru.set(cacheKey, { items, ts: Date.now() });
      if (lru.size > LRU_SIZE) {
        // Remove oldest
        const oldest = [...lru.entries()].sort((a, b) => a[1].ts - b[1].ts)[0][0];
        lru.delete(oldest);
      }
    }
  } else if (lat !== undefined && lng !== undefined && radius !== undefined) {
    // LRU cache for center/radius
    const cached = lru.get(cacheKey);
    if (cached && Date.now() - cached.ts < 300_000) {
      items = cached.items;
      source = 'OPENCHARGEMAP_CACHED';
    } else {
      items = await fetchStationsOCM({ lat, lng, radius, max });
      lru.set(cacheKey, { items, ts: Date.now() });
      if (lru.size > LRU_SIZE) {
        const oldest = [...lru.entries()].sort((a, b) => a[1].ts - b[1].ts)[0][0];
        lru.delete(oldest);
      }
    }
  } else {
    // Default London center
    lat = 51.5074;
    lng = -0.1278;
    radius = 10;
    cacheKey = getCacheKey(new URLSearchParams({ lat: String(lat), lng: String(lng), radius: String(radius) }));
    const cached = lru.get(cacheKey);
    if (cached && Date.now() - cached.ts < 300_000) {
      items = cached.items;
      source = 'OPENCHARGEMAP_CACHED';
    } else {
      items = await fetchStationsOCM({ lat, lng, radius, max });
      lru.set(cacheKey, { items, ts: Date.now() });
      if (lru.size > LRU_SIZE) {
        const oldest = [...lru.entries()].sort((a, b) => a[1].ts - b[1].ts)[0][0];
        lru.delete(oldest);
      }
    }
  }

  // On error, always respond [] with 200
  if (!Array.isArray(items)) items = [];
  return Response.json({ items, source });
}

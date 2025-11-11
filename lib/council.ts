// lib/council.ts
// Utilities and types for working with UK councils on the client.

// ───────────────── Types ─────────────────

export type BBox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

/**
 * Normalized shape we use in the UI. `region` and `country` are optional
 * so the UI can reference them safely without breaking builds.
 */
export type CouncilHit = {
  id?: string | number;
  name: string;
  code: string;
  bbox: BBox;
  geom?: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  region?: string | null;   // <-- optional
  country?: string | null;  // <-- optional
};

// ───────────── In-memory cache ─────────────

let _cache:
  | {
      list: CouncilHit[];
      byCode: Map<string, CouncilHit>;
      ts: number;
    }
  | null = null;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ───────────── Geometry helpers ─────────────

function computeBBox(geom?: GeoJSON.Polygon | GeoJSON.MultiPolygon): BBox {
  let minX = 180,
    minY = 90,
    maxX = -180,
    maxY = -90;

  if (!geom) return [minX, minY, maxX, maxY];

  const scanPolygon = (poly: GeoJSON.Polygon) => {
    for (const ring of poly.coordinates) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  };

  if (geom.type === "Polygon") {
    scanPolygon(geom);
  } else if (geom.type === "MultiPolygon") {
    for (const coords of geom.coordinates) {
      scanPolygon({ type: "Polygon", coordinates: coords });
    }
  }

  return [minX, minY, maxX, maxY];
}

function pointInRing(pt: [number, number], ring: number[][]): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(pt: [number, number], geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  if (geom.type === "Polygon") {
    const [outer, ...holes] = geom.coordinates;
    if (!pointInRing(pt, outer)) return false;
    for (const h of holes) if (pointInRing(pt, h)) return false;
    return true;
  }
  for (const poly of geom.coordinates) {
    const [outer, ...holes] = poly;
    if (pointInRing(pt, outer)) {
      for (const h of holes) if (pointInRing(pt, h)) return false;
      return true;
    }
  }
  return false;
}

// ───────────── Normalization ─────────────

function normalizeFeature(f: any): CouncilHit | null {
  if (!f) return null;
  const p = f.properties || {};
  const geom = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon | undefined;

  const name = String(p.name ?? p.NAME ?? "Council");
  const code = String(p.code ?? name.toLowerCase().replace(/\s+/g, "-"));
  const bbox: BBox = Array.isArray(p.bbox) && p.bbox.length === 4 ? (p.bbox as BBox) : computeBBox(geom);

  return {
    id: p.id ?? undefined,
    name,
    code,
    bbox,
    geom,
    // optional metadata if your tables provide them; fine if undefined
    region: (p.region as string | null) ?? null,
    country: (p.country as string | null) ?? null,
  };
}

// ───────────── Public API ─────────────

/**
 * Load and cache all councils (lightweight), using your API:
 *   GET /api/council?mode=bbox  → FeatureCollection
 */
export async function loadCouncils(force = false): Promise<CouncilHit[]> {
  const now = Date.now();
  if (!force && _cache && now - _cache.ts < CACHE_TTL_MS) return _cache.list;

  const res = await fetch("/api/council?mode=bbox", { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to load councils: ${res.status}`);
  const gj = await res.json();

  const list: CouncilHit[] = (Array.isArray(gj?.features) ? gj.features : [])
    .map(normalizeFeature)
    .filter(Boolean) as CouncilHit[];

  _cache = { list, byCode: new Map(list.map((c) => [c.code, c])), ts: now };
  return list;
}

/**
 * Fetch a single council by code (uses cache first then API):
 *   GET /api/council?mode=code&code=...
 */
export async function getCouncilByCode(code: string): Promise<CouncilHit | null> {
  if (!code) return null;

  // cache hit?
  if (_cache?.byCode?.has(code)) return _cache.byCode.get(code)!;

  try {
    const r = await fetch(`/api/council?mode=code&code=${encodeURIComponent(code)}`);
    if (!r.ok) return null;
    const j = await r.json();
    const hit = normalizeFeature(j?.feature);
    if (!hit) return null;

    // seed cache
    if (_cache) {
      _cache.byCode.set(hit.code, hit);
      if (!_cache.list.find((c) => c.code === hit.code)) _cache.list.push(hit);
    } else {
      _cache = {
        list: [hit],
        byCode: new Map([[hit.code, hit]]),
        ts: Date.now(),
      };
    }
    return hit;
  } catch {
    return null;
  }
}

/**
 * Return the council that contains the given point (lat,lng).
 * Uses the cached list and polygon contains test. If the cache
 * is cold, it will load councils first.
 */
export async function getCouncilAtPoint(lat: number, lng: number): Promise<CouncilHit | null> {
  const list = await loadCouncils();
  const pt: [number, number] = [lng, lat];

  // quick bbox prefilter
  for (const c of list) {
    const [minX, minY, maxX, maxY] = c.bbox;
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
    if (c.geom && pointInPolygon(pt, c.geom)) return c;
  }
  return null;
}

/** Utility: check if a point is inside a bbox */
export function inBBox(lat: number, lng: number, b: BBox): boolean {
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
}

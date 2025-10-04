import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

/** Public shape returned by this API */
export type Station = {
  id: string | number;
  lat: number;
  lng: number;
  name?: string;
  address?: string;
  postcode?: string;
  connectors?: number;
  source?: string;
};

// ---------------- helpers ----------------

/** London bbox defaults (EPSG:4326) */
const LONDON_BBOX = {
  north: 51.6919,
  south: 51.2867,
  east: 0.3340,
  west: -0.5104,
};

function parseBBox(u: URL) {
  // Accept either ?north=&south=&east=&west= or ?bbox=south,west,north,east
  const bboxStr = u.searchParams.get('bbox');
  if (bboxStr) {
    const [south, west, north, east] = bboxStr.split(',').map(Number);
    if ([south, west, north, east].every(n => Number.isFinite(n))) {
      return { north, south, east, west };
    }
  }
  const north = parseFloat(u.searchParams.get('north') ?? `${LONDON_BBOX.north}`);
  const south = parseFloat(u.searchParams.get('south') ?? `${LONDON_BBOX.south}`);
  const east  = parseFloat(u.searchParams.get('east')  ?? `${LONDON_BBOX.east}`);
  const west  = parseFloat(u.searchParams.get('west')  ?? `${LONDON_BBOX.west}`);

  return {
    north: Number.isFinite(north) ? north : LONDON_BBOX.north,
    south: Number.isFinite(south) ? south : LONDON_BBOX.south,
    east:  Number.isFinite(east)  ? east  : LONDON_BBOX.east,
    west:  Number.isFinite(west)  ? west  : LONDON_BBOX.west,
  };
}

/** Map any input shape (file/url/OCM) into Station */
function coerceStation(raw: any): Station | null {
  const lat =
    raw?.lat ??
    raw?.latitude ??
    raw?.Latitude ??
    raw?.AddressInfo?.Latitude;

  const lng =
    raw?.lng ??
    raw?.longitude ??
    raw?.Longitude ??
    raw?.AddressInfo?.Longitude;

  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const connectors =
    Array.isArray(raw?.Connections) ? raw.Connections.length :
    typeof raw?.connectors === 'number' ? raw.connectors : undefined;

  return {
    id: raw?.id ?? raw?.ID ?? `${lat},${lng}`,
    lat,
    lng,
    name: raw?.name ?? raw?.Title ?? raw?.AddressInfo?.Title,
    address:
      raw?.address ??
      raw?.AddressLine1 ??
      raw?.AddressInfo?.AddressLine1 ??
      undefined,
    postcode: raw?.postcode ?? raw?.Postcode ?? raw?.AddressInfo?.Postcode,
    connectors,
    source: raw?.source ?? raw?.Source ?? undefined,
  };
}

function mapOK(items: any[]): { items: Station[] } {
  const list = (items ?? []).map(coerceStation).filter(Boolean) as Station[];
  return { items: list };
}

async function readStationsFile(): Promise<{ items: Station[] }> {
  const root = process.cwd();
  const primary = path.join(root, 'public', 'data', 'stations.json');
  const sample  = path.join(root, 'public', 'data', 'stations.sample.json');

  for (const p of [primary, sample]) {
    try {
      const txt = await fs.readFile(p, 'utf-8');
      const json = JSON.parse(txt);
      const items = Array.isArray(json?.items) ? json.items : (Array.isArray(json) ? json : []);
      return mapOK(items);
    } catch {
      // try next file
    }
  }
  return { items: [] };
}

// ---------------- sources ----------------

async function fetchFromOCM(u: URL): Promise<{ items: Station[] }> {
  const { north, south, east, west } = parseBBox(u);

  const url = new URL('https://api.openchargemap.io/v3/poi/');
  url.searchParams.set('output', 'json');
  url.searchParams.set('countrycode', 'GB');
  url.searchParams.set('compact', 'true');
  url.searchParams.set('verbose', 'false');
  url.searchParams.set('includeComments', 'false');
  url.searchParams.set('maxresults', String(parseInt(process.env.OCM_MAX_RESULTS || '3000', 10)));
  // OCM expects: south,west,north,east
  url.searchParams.set('boundingbox', `${south},${west},${north},${east}`);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.OCM_API_KEY) headers['X-API-Key'] = process.env.OCM_API_KEY;

  const r = await fetch(url.toString(), { headers, cache: 'no-store' });
  if (!r.ok) throw new Error(`OCM ${r.status}`);
  const data = await r.json();
  return mapOK(Array.isArray(data) ? data : []);
}

async function fetchFromURL(): Promise<{ items: Station[] }> {
  const src = process.env.STATIONS_URL;
  if (!src) throw new Error('STATIONS_URL not set');
  const r = await fetch(src, { cache: 'no-store' });
  if (!r.ok) throw new Error(`URL ${r.status}`);
  const data = await r.json();
  const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
  return mapOK(items);
}

// ---------------- handler ----------------

export async function GET(req: Request) {
  // Auto-use OCM when a key exists, otherwise use STATIONS_SOURCE (default file)
  const source = (
    process.env.STATIONS_SOURCE || (process.env.OCM_API_KEY ? 'ocm' : 'file')
  ).toLowerCase();

  // Try preferred source; if empty/fails, fall back to file -> sample.
  try {
    if (source === 'ocm') {
      const out = await fetchFromOCM(new URL(req.url));
      if (out.items.length) return NextResponse.json(out, { headers: { 'cache-control': 'no-store' } });
    } else if (source === 'url') {
      const out = await fetchFromURL();
      if (out.items.length) return NextResponse.json(out, { headers: { 'cache-control': 'no-store' } });
    }
  } catch {
    // swallow and fall back
  }

  const fallback = await readStationsFile();
  return NextResponse.json(fallback, { headers: { 'cache-control': 'no-store' } });
}

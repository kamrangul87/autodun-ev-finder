import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

type Station = {
  id: string | number;
  lat: number;
  lng: number;
  name?: string;
  address?: string;
  postcode?: string;
  connectors?: number;
  source?: string;
};

const LONDON = { north: 51.6919, south: 51.2867, east: 0.3340, west: -0.5104 };

// ---------- helpers ----------
function pickBBox(u: URL) {
  const bboxStr = u.searchParams.get('bbox');
  if (bboxStr) {
    const [south, west, north, east] = bboxStr.split(',').map(Number);
    if ([south, west, north, east].every(n => Number.isFinite(n))) {
      return { north, south, east, west };
    }
  }
  const north = Number(u.searchParams.get('north') ?? LONDON.north);
  const south = Number(u.searchParams.get('south') ?? LONDON.south);
  const east  = Number(u.searchParams.get('east')  ?? LONDON.east);
  const west  = Number(u.searchParams.get('west')  ?? LONDON.west);
  return {
    north: Number.isFinite(north) ? north : LONDON.north,
    south: Number.isFinite(south) ? south : LONDON.south,
    east : Number.isFinite(east)  ? east  : LONDON.east,
    west : Number.isFinite(west)  ? west  : LONDON.west,
  };
}

function coerceStation(raw: any): Station | null {
  const lat = raw?.lat ?? raw?.latitude ?? raw?.Latitude ?? raw?.AddressInfo?.Latitude;
  const lng = raw?.lng ?? raw?.longitude ?? raw?.Longitude ?? raw?.AddressInfo?.Longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const connectors =
    Array.isArray(raw?.Connections) ? raw.Connections.length
    : typeof raw?.connectors === 'number' ? raw.connectors
    : undefined;

  return {
    id: raw?.id ?? raw?.ID ?? `${lat},${lng}`,
    lat, lng,
    name: raw?.name ?? raw?.Title ?? raw?.AddressInfo?.Title,
    address: raw?.address ?? raw?.AddressLine1 ?? raw?.AddressInfo?.AddressLine1 ?? undefined,
    postcode: raw?.postcode ?? raw?.Postcode ?? raw?.AddressInfo?.Postcode ?? undefined,
    connectors,
    source: raw?.source ?? raw?.Source ?? undefined,
  };
}

function mapOK(x: any): { items: Station[] } {
  const arr = Array.isArray(x?.items) ? x.items : (Array.isArray(x) ? x : []);
  const items = arr.map(coerceStation).filter(Boolean) as Station[];
  return { items };
}

async function readLocal(): Promise<{ items: Station[] }> {
  const root = process.cwd();
  const primary = path.join(root, 'public', 'data', 'stations.json');
  const sample  = path.join(root, 'public', 'data', 'stations.sample.json');
  for (const p of [primary, sample]) {
    try {
      const text = await fs.readFile(p, 'utf-8');
      return mapOK(JSON.parse(text));
    } catch {}
  }
  return { items: [] };
}

// ---------- sources ----------
async function fromOCM(u: URL): Promise<{ items: Station[] }> {
  const { north, south, east, west } = pickBBox(u);
  const max = Number(
    u.searchParams.get('max') ??
    u.searchParams.get('limit') ??
    process.env.OCM_MAX_RESULTS ??
    3000
  );

  const url = new URL('https://api.openchargemap.io/v3/poi/');
  url.searchParams.set('output', 'json');
  url.searchParams.set('countrycode', 'GB');
  url.searchParams.set('compact', 'true');
  url.searchParams.set('verbose', 'false');
  url.searchParams.set('includeComments', 'false');
  url.searchParams.set('maxresults', String(max));
  // south,west,north,east
  url.searchParams.set('boundingbox', `${south},${west},${north},${east}`);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.OCM_API_KEY) headers['X-API-Key'] = process.env.OCM_API_KEY;

  const r = await fetch(url.toString(), { headers, cache: 'no-store' });
  if (!r.ok) throw new Error(`OCM ${r.status}`);
  return mapOK(await r.json());
}

async function fromURL(): Promise<{ items: Station[] }> {
  const src = process.env.STATIONS_URL;
  if (!src) throw new Error('STATIONS_URL not set');
  const r = await fetch(src, { cache: 'no-store' });
  if (!r.ok) throw new Error(`URL ${r.status}`);
  return mapOK(await r.json());
}

// ---------- handler ----------
export async function GET(req: Request) {
  const u = new URL(req.url);

  // Manual override: ?source=ocm|url|file
  const qSource = u.searchParams.get('source')?.toLowerCase();
  // Default: use OCM if key exists; else env; else file
  const envSource = (process.env.STATIONS_SOURCE || (process.env.OCM_API_KEY ? 'ocm' : 'file')).toLowerCase();

  const tryOrder = [qSource, envSource, 'file'].filter(Boolean) as string[];
  let chosen = 'file';
  let out: { items: Station[] } = { items: [] };
  let errorMsg = '';

  for (const src of tryOrder) {
    try {
      if (src === 'ocm') out = await fromOCM(u);
      else if (src === 'url') out = await fromURL();
      else out = await readLocal();

      chosen = src;
      if (out.items.length > 0) break;
    } catch (e: any) {
      errorMsg = String(e?.message || e);
      // continue to next source
    }
  }

  const headers: Record<string, string> = {
    'cache-control': 'no-store',
    'x-ev-source': chosen,
    'x-ev-count': String(out.items.length),
  };
  if (errorMsg) headers['x-ev-error'] = errorMsg;

  if (u.searchParams.get('debug') === '1') {
    return NextResponse.json(
      { items: out.items, meta: { source: chosen, count: out.items.length, error: errorMsg || undefined } },
      { headers }
    );
  }
  return NextResponse.json(out, { headers });
}

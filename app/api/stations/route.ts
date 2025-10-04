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

// ---- helpers ---------------------------------------------------------------

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
    connectors: Array.isArray(raw?.Connections)
      ? raw.Connections.length
      : raw?.connectors ?? undefined,
    source: raw?.source ?? raw?.Source ?? undefined,
  };
}

function toOk(items: any[]): { items: Station[] } {
  const mapped = (items ?? [])
    .map(coerceStation)
    .filter(Boolean) as Station[];
  return { items: mapped };
}

async function readStationsFile(): Promise<{ items: Station[] }> {
  const root = process.cwd();
  const filePathPrimary = path.join(root, 'public', 'data', 'stations.json');
  const filePathSample = path.join(root, 'public', 'data', 'stations.sample.json');

  for (const p of [filePathPrimary, filePathSample]) {
    try {
      const txt = await fs.readFile(p, 'utf-8');
      const json = JSON.parse(txt);
      return toOk(Array.isArray(json?.items) ? json.items : json?.items ?? json);
    } catch {
      // keep trying next
    }
  }
  return { items: [] };
}

// ---- OCM fetch -------------------------------------------------------------

async function fetchFromOCM(reqUrl: URL): Promise<{ items: Station[] }> {
  const apiKey = process.env.OCM_API_KEY || '';
  const maxResults = parseInt(process.env.OCM_MAX_RESULTS || '3000', 10);

  // Default to full London bounding box if none provided
  const north = parseFloat(reqUrl.searchParams.get('north') ?? '51.6919');
  const south = parseFloat(reqUrl.searchParams.get('south') ?? '51.2867');
  const east  = parseFloat(reqUrl.searchParams.get('east')  ?? '0.3340');
  const west  = parseFloat(reqUrl.searchParams.get('west')  ?? '-0.5104');

  const url = new URL('https://api.openchargemap.io/v3/poi/');
  url.searchParams.set('output', 'json');
  url.searchParams.set('countrycode', 'GB');
  url.searchParams.set('compact', 'true');
  url.searchParams.set('verbose', 'false');
  url.searchParams.set('includeComments', 'false');
  url.searchParams.set('maxresults', String(maxResults));
  // OCM expects: south,west,north,east
  url.searchParams.set('boundingbox', `${south},${west},${north},${east}`);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;

  const resp = await fetch(url.toString(), { headers, cache: 'no-store' });
  if (!resp.ok) throw new Error(`OCM ${resp.status}`);
  const data = await resp.json();

  return toOk(Array.isArray(data) ? data : []);
}

// ---- URL source fetch ------------------------------------------------------

async function fetchFromURL(): Promise<{ items: Station[] }> {
  const src = process.env.STATIONS_URL;
  if (!src) throw new Error('STATIONS_URL not set');
  const resp = await fetch(src, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`URL ${resp.status}`);
  const data = await resp.json();
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return toOk(items);
}

// ---- handler ---------------------------------------------------------------

export async function GET(req: Request) {
  const source = (process.env.STATIONS_SOURCE || 'file').toLowerCase();

  try {
    if (source === 'ocm') {
      const out = await fetchFromOCM(new URL(req.url));
      if (out.items.length > 0) return NextResponse.json(out, { headers: { 'cache-control': 'no-store' } });
      // fall through to file if OCM returned nothing
    } else if (source === 'url') {
      const out = await fetchFromURL();
      if (out.items.length > 0) return NextResponse.json(out, { headers: { 'cache-control': 'no-store' } });
      // fall through to file if empty
    }
  } catch (e) {
    // swallow and fall back
  }

  // Final fallback: local files
  const fallback = await readStationsFile();
  return NextResponse.json(fallback, { headers: { 'cache-control': 'no-store' } });
}

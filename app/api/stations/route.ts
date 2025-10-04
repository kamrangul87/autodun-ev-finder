import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic'; // avoid caching in dev
// export const runtime = 'nodejs'; // ensure Node runtime (uncomment if your project defaults to edge)

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

const SRC = process.env.STATIONS_SOURCE || 'file';
const STATIONS_URL = process.env.STATIONS_URL || '';
const OCM_API_KEY = process.env.OCM_API_KEY || '';
const OCM_MAX_RESULTS = Number(process.env.OCM_MAX_RESULTS || 200);

/** Map anything to our Station shape (loose keys supported). */
function mapAnyToStation(x: any): Station | null {
  if (!x) return null;
  const lat = x.lat ?? x.latitude ?? x?.AddressInfo?.Latitude;
  const lng = x.lng ?? x.lon ?? x.longitude ?? x?.AddressInfo?.Longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const id =
    x.id ?? x.ID ?? x._id ?? `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;

  const name =
    x.name ?? x.Title ?? x?.AddressInfo?.Title ?? x?.AddressInfo?.AddressLine1;
  const address = x.address ?? x?.AddressInfo?.AddressLine1;
  const postcode = x.postcode ?? x?.AddressInfo?.Postcode;

  const connectors =
    x.connectors ??
    x.NumberOfPoints ??
    (Array.isArray(x.Connections) ? x.Connections.length : undefined);

  const source = x.source ?? (x.AddressInfo ? 'ocm' : 'file');

  return { id, lat, lng, name, address, postcode, connectors, source };
}

function safeMap(arr: any[]): Station[] {
  return (arr || []).map(mapAnyToStation).filter(Boolean) as Station[];
}

/** Final fallback so UI always renders something. */
function tinyFallback(): Station[] {
  return [
    { id: 'fallback-1', lat: 51.5033, lng: -0.1195, name: 'London Eye', connectors: 2, source: 'fallback' },
    { id: 'fallback-2', lat: 51.5079, lng: -0.0877, name: 'London Bridge', connectors: 4, source: 'fallback' },
  ];
}

/** Read from /public/data via absolute path; if it fails, try HTTP fetch from current origin. */
async function readStationsFromPublic(req: NextRequest): Promise<Station[]> {
  const root = process.cwd();
  const candidates = [
    path.join(root, 'public', 'data', 'stations.json'),
    path.join(root, 'public', 'data', 'stations.sample.json'),
  ];

  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const json = JSON.parse(raw);
      const arr = Array.isArray(json) ? json : json.items || [];
      const mapped = safeMap(arr);
      if (mapped.length) return mapped;
    } catch {
      // continue
    }
  }

  // HTTP fallback using the request origin (works on Vercel if fs pathing fails)
  try {
    const origin = new URL(req.url).origin;
    const urls = [
      `${origin}/data/stations.json`,
      `${origin}/data/stations.sample.json`,
    ];
    for (const u of urls) {
      const r = await fetch(u, { cache: 'no-store' });
      if (r.ok) {
        const json = await r.json();
        const arr = Array.isArray(json) ? json : json.items || [];
        const mapped = safeMap(arr);
        if (mapped.length) return mapped;
      }
    }
  } catch {
    // ignore
  }

  return tinyFallback();
}

async function fromURL(): Promise<Station[]> {
  if (!STATIONS_URL) return tinyFallback();
  try {
    const r = await fetch(STATIONS_URL, { cache: 'no-store' });
    const data = await r.json();
    const arr = Array.isArray(data) ? data : data.items || [];
    const mapped = safeMap(arr);
    return mapped.length ? mapped : tinyFallback();
  } catch {
    return tinyFallback();
  }
}

async function fromOCM(searchParams: URLSearchParams): Promise<Station[]> {
  try {
    const bbox =
      ['north', 'south', 'east', 'west'].every(k => searchParams.get(k));
    let url: string;

    if (bbox) {
      const north = searchParams.get('north');
      const south = searchParams.get('south');
      const east  = searchParams.get('east');
      const west  = searchParams.get('west');
      url = `https://api.openchargemap.io/v3/poi/?output=json&countrycode=GB&maxresults=${OCM_MAX_RESULTS}&boundingbox=${south},${west},${north},${east}`;
    } else {
      // Default: central London radius
      url = `https://api.openchargemap.io/v3/poi/?output=json&countrycode=GB&maxresults=${OCM_MAX_RESULTS}&latitude=51.5074&longitude=-0.1278&distance=15&distanceunit=KM`;
    }

    const headers: Record<string,string> = { Accept: 'application/json' };
    if (OCM_API_KEY) headers['X-API-Key'] = OCM_API_KEY;

    const r = await fetch(url, { headers, cache: 'no-store' });
    const data = await r.json();
    const arr = Array.isArray(data) ? data : [];
    const mapped = safeMap(arr);
    return mapped.length ? mapped : tinyFallback();
  } catch {
    return tinyFallback();
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let items: Station[] = [];

  const src = (SRC || 'file').toLowerCase();
  if (src === 'url') items = await fromURL();
  else if (src === 'ocm') items = await fromOCM(searchParams);
  else items = await readStationsFromPublic(req);

  return NextResponse.json({ items });
}

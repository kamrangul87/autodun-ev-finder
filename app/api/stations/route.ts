

export const runtime = 'nodejs';
export const revalidate = 0;

import { NextResponse } from 'next/server';

type Connector = { type: string; powerKW?: number; quantity?: number };
type Station = {
  id: number; name: string; lat: number; lng: number;
  address?: string; postcode?: string; connectors: Connector[];
};

type OcmPoi = {
  ID: number;
  AddressInfo?: {
    Title?: string;
    Latitude?: number;
    Longitude?: number;
    AddressLine1?: string;
    Postcode?: string;
  };
  Connections?: Array<{
    ConnectionType?: { Title?: string } | null;
    PowerKW?: number | null;
    Quantity?: number | null;
  }> | null;
};

const OCM_ENDPOINT = 'https://api.openchargemap.io/v3/poi/';

function mapToStation(p: OcmPoi): Station | null {
  const a = p.AddressInfo;
  if (!a?.Latitude || !a?.Longitude) return null;
  return {
    id: p.ID,
    name: a.Title ?? 'EV Charger',
    lat: a.Latitude,
    lng: a.Longitude,
    address: a.AddressLine1 ?? undefined,
    postcode: a.Postcode ?? undefined,
    connectors: (p.Connections ?? []).map(c => ({
      type: c?.ConnectionType?.Title ?? 'Unknown',
      powerKW: c?.PowerKW ?? undefined,
      quantity: c?.Quantity ?? undefined,
    })),
  };
}

async function ocmFetch(url: URL, signal?: AbortSignal) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const key = process.env.OCM_KEY;
  if (key) headers['X-API-Key'] = key;           // header
  if (key) url.searchParams.set('key', key);     // query (belt & suspenders)
  url.searchParams.set('client', process.env.OCM_CLIENT ?? 'autodun-ev-finder');
  url.searchParams.set('compact', 'true');
  url.searchParams.set('verbose', 'false');

  const res = await fetch(url.toString(), { headers, signal, cache: 'no-store' });
  const txt = await res.text();
  if (!res.ok) {
    return { error: `OCM ${res.status}`, text: txt, data: [] as OcmPoi[] };
  }
  try {
    return { data: JSON.parse(txt) as OcmPoi[], text: txt };
  } catch {
    return { error: 'JSON_PARSE', text: txt, data: [] as OcmPoi[] };
  }
}

function parseBBox(raw?: string): [number, number, number, number] | null {
  if (!raw) return null;
  const m = raw.match(/\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\),\s*\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
  if (!m) return null;
  const south = parseFloat(m[1]), west = parseFloat(m[2]), north = parseFloat(m[3]), east = parseFloat(m[4]);
  if ([south, west, north, east].some(n => Number.isNaN(n))) return null;
  return [south, west, north, east];
}

async function ocmByBBox(b: [number, number, number, number], max = 200) {
  const [south, west, north, east] = b;
  const url = new URL(OCM_ENDPOINT);
  url.searchParams.set('maxresults', String(Math.min(max, 200)));
  url.searchParams.set('boundingbox', `(${south},${west}),(${north},${east})`);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000);
  try {
    const { data, error } = await ocmFetch(url, ac.signal);
    const items = data.map(mapToStation).filter(Boolean) as Station[];
    return { items, source: 'OCM_BBOX', debug: { url: url.toString(), received: data.length, error } };
  } finally { clearTimeout(t); }
}

async function ocmByRadius(lat: number, lng: number, km = 10, max = 200) {
  const url = new URL(OCM_ENDPOINT);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('distance', String(km));
  url.searchParams.set('distanceunit', 'KM');
  url.searchParams.set('maxresults', String(Math.min(max, 200)));
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000);
  try {
    const { data, error } = await ocmFetch(url, ac.signal);
    const items = data.map(mapToStation).filter(Boolean) as Station[];
    return { items, source: 'OCM_RADIUS', debug: { url: url.toString(), received: data.length, error } };
  } finally { clearTimeout(t); }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const bboxRaw = searchParams.get('bbox');
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const radius = Number(searchParams.get('radius') ?? '10');
  const max = Number(searchParams.get('max') ?? '200');

  try {
    let payload;
    const bbox = parseBBox(bboxRaw ?? undefined);

    if (bbox) {
      payload = await ocmByBBox(bbox, max);
      if (!payload.items.length) {
        const centerLat = (bbox[0] + bbox[2]) / 2;
        const centerLng = (bbox[1] + bbox[3]) / 2;
        const fb = await ocmByRadius(centerLat, centerLng, Math.max(radius, 8), max);
        payload = { ...fb, source: `${payload.source}_FALLBACK` };
      }
    } else if (lat && lng) {
      payload = await ocmByRadius(Number(lat), Number(lng), radius, max);
    } else {
      payload = await ocmByRadius(51.5074, -0.1278, 10, max);
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ items: [], source: 'ERROR', debug: { error: String(e?.message ?? e) } }, { status: 200 });
  }
}

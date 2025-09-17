export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const OCM_BASE = 'https://api.openchargemap.io/v3/poi/';

function getOCMKey(): string | undefined {
  const k = process.env.OCM_API_KEY || process.env.OPENCHARGEMAP_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

function mapOcmToStation(poi: any) {
  return poi; // your UI normaliser on the client handles pure OCM POIs already
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get('lat') || '');
  const lon = parseFloat(url.searchParams.get('lon') || '');
  const dist = Math.max(4.5, parseFloat(url.searchParams.get('dist') || '25'));
  const conn = url.searchParams.get('conn') || undefined;
  const minPower = url.searchParams.get('minPower') || undefined;

  const apiKey = getOCMKey();
  const headers: HeadersInit = { 'User-Agent': 'Autodun/1.0', Accept: 'application/json' };
  if (apiKey) (headers as any)['X-API-Key'] = apiKey;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: 'lat/lon required' }, { status: 400 });
  }

  const u = new URL(OCM_BASE);
  u.searchParams.set('output', 'json');
  u.searchParams.set('compact', 'true');
  u.searchParams.set('verbose', 'false');
  u.searchParams.set('maxresults', '1000');
  u.searchParams.set('latitude', String(lat));
  u.searchParams.set('longitude', String(lon));
  u.searchParams.set('distance', String(dist));
  u.searchParams.set('distanceunit', 'KM');
  if (apiKey) u.searchParams.set('key', apiKey);
  if (conn) u.searchParams.set('connectiontypeid', conn);
  if (minPower) u.searchParams.set('minpowerkw', minPower);

  try {
    const r = await fetch(u, { headers, cache: 'no-store' });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`OCM ${r.status}: ${t.slice(0, 300)}`);
    }
    const data = await r.json();
    const arr = Array.isArray(data) ? data : [];
    return NextResponse.json(arr.map(mapOcmToStation), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'stations fetch failed', message: String(e) }, { status: 502 });
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { NextResponse } from 'next/server';

function parseBbox(sp: URLSearchParams): [number, number, number, number] | null {
  const n = Number(sp.get('north'));
  const s = Number(sp.get('south'));
  const e = Number(sp.get('east'));
  const w = Number(sp.get('west'));
  if (![n, s, e, w].every(Number.isFinite)) return null;
  if (n <= s || e <= w) return null;
  return [n, s, e, w];
}

function normalizeOCM(p: any) {
  const ai = p?.AddressInfo ?? {};
  const conns = Array.isArray(p?.Connections) ? p.Connections : [];
  const maxPower = conns.reduce((m: number, c: any) => {
    const p = Number(c?.PowerKW ?? 0);
    return isFinite(p) ? Math.max(m, p) : m;
  }, 0);
  const connTitles = conns.map((c: any) => (c?.ConnectionType?.Title ?? '').toLowerCase()).join(',');
  return {
    id: p?.ID ?? null,
    name: ai?.Title ?? null,
    lat: ai?.Latitude,
    lng: ai?.Longitude,
    addr: [ai?.AddressLine1, ai?.Town].filter(Boolean).join(', ') || null,
    postcode: ai?.Postcode ?? null,
    breakdown: { reports: 0, downtime: 0, connectors: conns.length },
    power: maxPower || null,
    network: p?.OperatorInfo?.Title ?? null,
    updatedAt: p?.DateLastStatusUpdate ?? null,
    _connTitles: connTitles,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const bbox = parseBbox(sp);
  if (!bbox) {
    return NextResponse.json({ error: 'invalid_bbox' }, { status: 400 });
  }
  const [north, south, east, west] = bbox;
  const minPower = Number(sp.get('minPower'));
  const conn = sp.get('conn');
  const connList = conn ? conn.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : null;

  const params = new URLSearchParams({
    boundingbox: `${south},${west},${north},${east}`,
    compact: 'true',
    maxresults: '1000',
    output: 'json',
  });
  const apiKey = process.env.OCM_API_KEY;
  const headers: Record<string, string> = {};
  if (apiKey) headers['X-API-Key'] = apiKey;

  let ocmData: any[] = [];
  let fetchError: any = null;
  try {
    console.time?.('stations:ocm');
    const r = await fetch(
      `https://api.openchargemap.io/v3/poi/?${params.toString()}`,
      { headers, next: { revalidate: 30 } }
    );
    if (!r.ok) throw new Error(`OCM ${r.status}`);
    ocmData = await r.json();
    console.timeEnd?.('stations:ocm');
  } catch (e) {
    fetchError = e;
    ocmData = [];
    console.timeEnd?.('stations:ocm');
  }

  let rows = Array.isArray(ocmData) ? ocmData.map(normalizeOCM) : [];
  rows = rows.filter(r =>
    typeof r.lat === 'number' &&
    typeof r.lng === 'number' &&
    (!minPower || (typeof r.power === 'number' && r.power >= minPower)) &&
    (!connList || connList.some(c => r._connTitles?.includes(c)))
  );
  rows.forEach(r => { delete r._connTitles; });

  return NextResponse.json(rows, {
    headers: { 'Cache-Control': 'private, max-age=30' }
  });
}

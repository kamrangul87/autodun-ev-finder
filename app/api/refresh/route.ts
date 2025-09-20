export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

// Reuse your OCM fetcher via the stations endpoint for simplicity
async function fetchChunk(lat: number, lon: number, radiusKm = 20) {
  const u = new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost');
  u.pathname = '/api/stations';
  u.searchParams.set('lat', String(lat));
  u.searchParams.set('lon', String(lon));
  u.searchParams.set('radiusKm', String(radiusKm));
  const r = await fetch(u.toString(), { cache: 'no-store' });
  const arr = await r.json();
  return Array.isArray(arr) ? arr : [];
}

export async function GET() {
  try {
    // Grid centers roughly covering Greater London (tweak later)
    const centers = [
      [51.5072, -0.1276], [51.55, -0.2], [51.55, 0.0],
      [51.48, -0.3], [51.48, 0.1], [51.6, -0.15]
    ];

    const chunks = await Promise.all(centers.map(([lat, lon]) => fetchChunk(lat, lon, 18)));
    // naive merge by OCM ID
    const map = new Map<string, any>();
    for (const arr of chunks) {
      for (const p of arr) {
        const id = String(p?.ID ?? `${p?.AddressInfo?.Latitude},${p?.AddressInfo?.Longitude}`);
        if (!map.has(id)) map.set(id, p);
      }
    }
    const all = Array.from(map.values());
    const payload = { ts: Date.now(), count: all.length, items: all };

    await kv.set('stations:latest', payload);
    await kv.set('stations:latest:ts', payload.ts);

    return NextResponse.json({ ok: true, count: all.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

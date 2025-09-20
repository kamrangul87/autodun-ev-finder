// app/api/refresh/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/** Lazy KV loader so builds succeed even if @vercel/kv isn't installed */
async function loadKV() {
  try {
    if (!process.env.KV_REST_API_URL) return null; // only try if KV configured
    const mod = await import('@vercel/kv');
    return mod.kv;
  } catch {
    return null;
  }
}

/** Fetch a chunk of stations from our own stations API */
async function fetchChunk(baseUrl: string, lat: number, lon: number, radiusKm = 18) {
  const u = new URL('/api/stations', baseUrl);
  u.searchParams.set('lat', String(lat));
  u.searchParams.set('lon', String(lon));
  u.searchParams.set('radiusKm', String(radiusKm));
  const r = await fetch(u.toString(), { cache: 'no-store' });
  if (!r.ok) throw new Error(`stations ${r.status}`);
  const arr = await r.json();
  return Array.isArray(arr) ? arr : [];
}

export async function GET(req: NextRequest) {
  try {
    const base =
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
      req.nextUrl.origin;

    const centers: Array<[number, number]> = [
      [51.5072, -0.1276],
      [51.55, -0.20],
      [51.55,  0.00],
      [51.48, -0.30],
      [51.48,  0.10],
      [51.60, -0.15],
    ];

    const chunks = await Promise.all(
      centers.map(([lat, lon]) => fetchChunk(base, lat, lon, 18))
    );

    // merge by OCM ID (fallback to lat,lon)
    const merged = new Map<string, any>();
    for (const arr of chunks) {
      for (const p of arr) {
        const key =
          p?.ID != null
            ? String(p.ID)
            : `${p?.AddressInfo?.Latitude ?? ''},${p?.AddressInfo?.Longitude ?? ''}`;
        if (key && !merged.has(key)) merged.set(key, p);
      }
    }

    const items = Array.from(merged.values());
    const payload = { ts: Date.now(), count: items.length, items };

    const kv = await loadKV();
    if (kv) {
      await kv.set('stations:latest', payload);
      await kv.set('stations:latest:ts', payload.ts);
    }

    return NextResponse.json({ ok: true, count: payload.count, persisted: !!kv });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

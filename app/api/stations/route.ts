/* === AUTODUN DATA-FETCH LOCK ===
   Contract (now backward-compatible):
   ✅ GET /api/stations?west&south&east&north&zoom
   ✅ GET /api/stations?bbox=west,south,east,north&zoom
   Returns: { items: Station[], [fallback?: true], [reason?: string] }
   Fallbacks: OpenChargeMap → Overpass(OSM) → Mock
*/

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Station = {
  id: string | number | null;
  name: string | null;
  addr: string | null;
  postcode: string | null;
  lat: number;
  lon: number;
  connectors: number;
  reports: number;
  downtime: number;
  source: string;
};

function normalizeOCM(arr: any[]): Station[] {
  return (arr ?? []).map((d: any) => ({
    id: d.ID ?? null,
    name: d.AddressInfo?.Title ?? null,
    addr: d.AddressInfo?.AddressLine1 ?? null,
    postcode: d.AddressInfo?.Postcode ?? null,
    lat: Number(d.AddressInfo?.Latitude),
    lon: Number(d.AddressInfo?.Longitude),
    connectors: d.Connections?.length ?? 0,
    reports: d.UserComments?.length ?? 0,
    downtime: 0,
    source: 'ocm',
  })).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon));
}

function normalizeOverpass(arr: any[]): Station[] {
  return (arr ?? []).map((el: any) => ({
    id: el.id ?? null,
    name: el.tags?.name ?? 'EV Charging',
    addr: el.tags?.['addr:street'] ?? null,
    postcode: el.tags?.['addr:postcode'] ?? null,
    lat: Number(el.lat),
    lon: Number(el.lon),
    connectors: Number(el.tags?.sockets ?? el.tags?.capacity ?? el.tags?.connectors ?? 0) || 0,
    reports: 0,
    downtime: 0,
    source: 'osm',
  })).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon));
}

function mockPayload(reason: string) {
  return {
    items: [
      { id: 'mock1', name: 'Test Station A', addr: null, postcode: null, lat: 51.509, lon: -0.118, connectors: 4, reports: 2, downtime: 0, source: 'mock' },
      { id: 'mock2', name: 'Test Station B', addr: null, postcode: null, lat: 51.515, lon: -0.100, connectors: 2, reports: 0, downtime: 0, source: 'mock' },
    ] as Station[],
    fallback: true as const,
    reason,
  };
}

function parseBbox(searchParams: URLSearchParams) {
  // New style
  const west  = searchParams.get('west');
  const south = searchParams.get('south');
  const east  = searchParams.get('east');
  const north = searchParams.get('north');

  // Back-compat: ?bbox=west,south,east,north
  let w = west, s = south, e = east, n = north;
  if (!(w && s && e && n)) {
    const bbox = searchParams.get('bbox');
    if (bbox) {
      const parts = bbox.split(',').map(v => v.trim());
      if (parts.length === 4) {
        [w, s, e, n] = parts;
      }
    }
  }

  if (!(w && s && e && n)) return null;

  const W = Number(w), S = Number(s), E = Number(e), N = Number(n);
  if ([W, S, E, N].some(v => Number.isNaN(v))) return null;

  // Validate loose ranges
  if (W < -180 || W > 180 || E < -180 || E > 180 || S < -90 || S > 90 || N < -90 || N > 90) {
    return null;
  }
  // Swap if user accidentally sent reversed bbox
  const westN  = Math.min(W, E);
  const eastN  = Math.max(W, E);
  const southN = Math.min(S, N);
  const northN = Math.max(S, N);

  return { west: westN, south: southN, east: eastN, north: northN };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bbox = parseBbox(searchParams);
  const zoom = Number(searchParams.get('zoom') ?? 11);

  if (!bbox) {
    return NextResponse.json({ error: 'Missing or invalid bbox' }, { status: 400 });
  }

  let lastError = '';
  // ⚠️ Ensure this env var exists on Vercel: OPENCHARGEMAP_KEY
  const apiKey = process.env.OPENCHARGEMAP_KEY ?? '';

  // 1) OpenChargeMap (expects: south,west,north,east)
  if (apiKey) {
    try {
      let maxResults = 50;
      if (zoom < 8)       maxResults = 20;
      else if (zoom < 12) maxResults = 100;
      else                maxResults = 200;

      const ocmUrl =
        `https://api.openchargemap.io/v3/poi/` +
        `?output=json&countrycode=GB&boundingbox=${bbox.south},${bbox.west},${bbox.north},${bbox.east}` +
        `&maxresults=${maxResults}&compact=true&verbose=false`;

      const ocmRes = await fetch(ocmUrl, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        cache: 'no-store',
      });

      if (ocmRes.ok) {
        const json = await ocmRes.json();
        const items = normalizeOCM(Array.isArray(json) ? json : []);
        if (items.length) return NextResponse.json({ items }, { status: 200 });
        lastError = 'OCM returned 0 items';
      } else {
        lastError = `OCM ${ocmRes.status}: ${await ocmRes.text().catch(()=> '')}`;
      }
    } catch (e: any) {
      lastError = `OCM error: ${e?.message ?? 'unknown'}`;
    }
  } else {
    lastError = 'OPENCHARGEMAP_KEY missing';
  }

  // 2) Overpass fallback (expects: south,west,north,east)
  try {
    const query = `
      [out:json][timeout:20];
      (
        node["amenity"="charging_station"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      );
      out body;
    `.trim();

    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ data: query }).toString(),
      cache: 'no-store',
    });

    if (res.ok) {
      const json = await res.json();
      const items = normalizeOverpass(json?.elements ?? []);
      if (items.length) {
        return NextResponse.json(
          { items, fallback: true, reason: `Used Overpass. Prior: ${lastError}` },
          { status: 200 }
        );
      }
      lastError = `Overpass 0 items (prior: ${lastError})`;
    } else {
      lastError = `Overpass ${res.status}: ${await res.text().catch(()=> '')}; prior: ${lastError}`;
    }
  } catch (e: any) {
    lastError = `Overpass error: ${e?.message ?? 'unknown'}; prior: ${lastError}`;
  }

  // 3) Mock (last resort)
  return NextResponse.json(mockPayload(lastError || 'Unknown error'), { status: 200 });
}

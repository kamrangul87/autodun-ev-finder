import { NextRequest } from 'next/server';

// Always dynamic (don’t statically optimize this route)
export const dynamic = 'force-dynamic';
// Ensure Node runtime so process.env is available on Vercel
export const runtime = 'nodejs';

// -----------------------------------------------------------------------------
// Helpers

const norm = (s: unknown) =>
  String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

const toNum = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return Math.round(R * c * 10) / 10;
}

function connectorText(station: any): string {
  const parts: string[] = [];
  for (const c of station?.Connections ?? []) {
    parts.push(
      norm(c?.ConnectionType?.FormalName),
      norm(c?.ConnectionType?.Title),
      norm(c?.Comments),
      norm(c?.Reference)
    );
  }
  return parts.filter(Boolean).join(' | ');
}

function matchesConnector(station: any, connQuery: string): boolean {
  const q = norm(connQuery);
  if (!q) return true;

  const hay = connectorText(station);

  if (q === 'type 2' || q.includes('type 2')) return /type\s*2|mennekes/.test(hay);
  if (q === 'ccs' || q.includes('ccs'))
    return /ccs|combo|combined(\s+charging\s+system)?|type\s*2\s*combo/.test(hay);
  if (q === 'chademo' || q.includes('chademo')) return /chade?mo/.test(hay);

  return hay.includes(q);
}

function hasMinPower(station: any, minPower: number): boolean {
  if (!minPower) return true;
  const powers = (station?.Connections ?? []).map((c: any) => toNum(c?.PowerKW, 0));
  return powers.some((p: number) => p >= minPower);
}

// -----------------------------------------------------------------------------
// GET

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    // Bbox inputs (optional)
    const north = toNum(sp.get('north'), NaN);
    const south = toNum(sp.get('south'), NaN);
    const east = toNum(sp.get('east'), NaN);
    const west = toNum(sp.get('west'), NaN);
    const hasBounds = [north, south, east, west].every((v) => Number.isFinite(v));

    // Center-based inputs (fallback / legacy)
    const latParam = toNum(sp.get('lat'), NaN);
    const lonParam = toNum(sp.get('lon'), NaN);
    const distParam = Math.max(1, toNum(sp.get('dist'), 10)); // km
    const minPower = Math.max(0, toNum(sp.get('minPower'), 0));
    const conn = sp.get('conn') ?? '';

    // Sources: ocm / council / all
    const sourceParam = (sp.get('source') ?? '').toLowerCase();
    const includeOCM = !sourceParam || sourceParam === 'ocm' || sourceParam === 'all';
    const includeCouncil = !sourceParam || sourceParam === 'council' || sourceParam === 'all';

    // Compute center + radius
    let lat: number;
    let lon: number;
    let dist: number;

    if (hasBounds) {
      lat = (north + south) / 2;
      lon = (east + west) / 2;

      // radius sufficient to reach all 4 corners + 20% buffer, with a 5km minimum
      const corners: [number, number][] = [
        [north, east],
        [north, west],
        [south, east],
        [south, west],
      ];
      let maxCornerDist = 0;
      for (const [cLat, cLon] of corners) {
        const d = haversineKm(lat, lon, cLat, cLon);
        if (d > maxCornerDist) maxCornerDist = d;
      }
      dist = Math.max(5, Math.round(maxCornerDist * 1.2 * 10) / 10);
    } else {
      lat = latParam;
      lon = lonParam;
      dist = distParam;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return new Response(JSON.stringify({ error: 'Missing lat/lon' }), { status: 400 });
      }
    }

    // -------- OCM fetch --------
    const params = new URLSearchParams({
      output: 'json',
      countrycode: 'GB',
      latitude: String(lat),
      longitude: String(lon),
      distance: String(dist),
      distanceunit: 'KM',
      maxresults: '500',
      compact: 'false',
      verbose: 'true',
      includecomments: 'false',
    });

    const key = process.env.OPENCHARGEMAP_API_KEY || process.env.OCM_API_KEY;
    if (key) params.set('key', String(key));

    const url = `https://api.openchargemap.io/v3/poi/?${params.toString()}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'Autodun-EV-Finder/1.0 (contact: info@autodun.com)',
    };
    if (key) headers['X-API-Key'] = String(key);

    const res = await fetch(url, { headers, cache: 'no-store' });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return new Response(
        JSON.stringify({ error: `OCM ${res.status}`, detail, url }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    const raw = (await res.json().catch(() => [])) as any[];
    const items = Array.isArray(raw) ? raw : [];

    // OCM filters (NO extra bbox clipping here to avoid accidentally removing everything)
    const ocmFiltered = items.filter((s) => {
      if (!includeOCM) return false;
      return matchesConnector(s, conn) && hasMinPower(s, minPower);
    });

    // -------- Council (local JSON) --------
    let councilStations: any[] = [];
    if (includeCouncil) {
      try {
        const globalAny = globalThis as any;
        if (!globalAny.__councilStationsCache) {
          const { readFile } = await import('fs/promises');
          const dataPath = process.cwd() + '/data/councilStations.json';
          const json = await readFile(dataPath, 'utf-8');
          globalAny.__councilStationsCache = JSON.parse(json);
        }
        councilStations = (globalThis as any).__councilStationsCache as any[];
      } catch (err) {
        console.error('Failed to read council stations', err);
        councilStations = [];
      }
    }

    // Apply same connector/power checks; bbox clipping here is OK (the local set is small)
    const councilFiltered = councilStations.filter((s) => {
      if (!includeCouncil) return false;
      if (!(matchesConnector(s, conn) && hasMinPower(s, minPower))) return false;

      if (hasBounds) {
        const ai = s?.AddressInfo ?? {};
        const sLat = toNum(ai?.Latitude, NaN);
        const sLon = toNum(ai?.Longitude, NaN);
        if (!Number.isFinite(sLat) || !Number.isFinite(sLon)) return false;
        const minLat = Math.min(north, south);
        const maxLat = Math.max(north, south);
        const minLon = Math.min(east, west);
        const maxLon = Math.max(east, west);
        if (sLat > maxLat || sLat < minLat) return false;
        if (sLon > maxLon || sLon < minLon) return false;
      }
      return true;
    });

    // Trim + annotate
    function trimRecord(s: any): any {
      const ai = s?.AddressInfo ?? {};
      const sLat = toNum(ai?.Latitude, NaN);
      const sLon = toNum(ai?.Longitude, NaN);

      const distanceKm =
        Number.isFinite(toNum(ai?.Distance, NaN))
          ? Math.round(toNum(ai?.Distance) * 10) / 10
          : Number.isFinite(sLat) && Number.isFinite(sLon)
          ? haversineKm(lat, lon, sLat, sLon)
          : null;

      return {
        ID: s?.ID,
        AddressInfo: {
          Title: ai?.Title ?? null,
          AddressLine1: ai?.AddressLine1 ?? null,
          Town: ai?.Town ?? null,
          Postcode: ai?.Postcode ?? null,
          Latitude: Number.isFinite(sLat) ? sLat : null,
          Longitude: Number.isFinite(sLon) ? sLon : null,
          ContactTelephone1: ai?.ContactTelephone1 ?? null,
          RelatedURL: ai?.RelatedURL ?? null,
        },
        Connections: (s?.Connections ?? []).map((c: any) => ({
          PowerKW: toNum(c?.PowerKW, null as any),
          ConnectionType: {
            Title: c?.ConnectionType?.Title ?? null,
            FormalName: c?.ConnectionType?.FormalName ?? null,
          },
        })),
        StatusType: {
          Title: s?.StatusType?.Title ?? null,
          IsOperational:
            typeof s?.StatusType?.IsOperational === 'boolean'
              ? s?.StatusType?.IsOperational
              : null,
        },
        Feedback: (() => {
          const globalAny = globalThis as any;
          const store: Record<number, { rating: number; comment?: string; timestamp: number }[]> =
            globalAny.__feedbackStore ?? {};
          const fb = store[s?.ID] ?? [];
          const count = fb.length;
          const avg = count ? fb.reduce((sum, f) => sum + f.rating, 0) / count : null;
          const reliability = typeof avg === 'number' ? avg / 5 : null;
          return { count, averageRating: avg, reliability };
        })(),
        DataSource: s?.DataSource ?? 'OCM',
        _distanceKm: distanceKm,
      };
    }

    const trimmedOCM = ocmFiltered.map(trimRecord);
    const trimmedCouncil = councilFiltered.map(trimRecord);
    const out = [...trimmedOCM, ...trimmedCouncil];

    // Sort by distance (nulls last)
    out.sort((a: any, b: any) => {
      const dA = a._distanceKm;
      const dB = b._distanceKm;
      if (dA == null && dB == null) return 0;
      if (dA == null) return 1;
      if (dB == null) return -1;
      return dA - dB;
    });

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: 'stations_route_exception', items: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
}

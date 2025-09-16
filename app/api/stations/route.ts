import { NextRequest } from 'next/server';

// Always run dynamically
export const dynamic = 'force-dynamic';

// ----- helpers ---------------------------------------------------------------

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const toNum = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Haversine (km), rounded to 0.1 km for compatibility
function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
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
      norm(c?.Reference),
    );
  }
  return parts.filter(Boolean).join(' | ');
}

function matchesConnector(station: any, connQuery: string): boolean {
  const q = norm(connQuery);
  if (!q) return true;
  const hay = connectorText(station);

  if (q === 'type 2' || q.includes('type 2')) return /type\s*2|mennekes/.test(hay);
  if (q === 'ccs' || q.includes('ccs')) return /ccs|combo|combined(\s+charging\s+system)?|type\s*2\s*combo/.test(hay);
  if (q === 'chademo' || q.includes('chademo')) return /chade?mo/.test(hay);
  return hay.includes(q);
}

function hasMinPower(station: any, minPower: number): boolean {
  if (!minPower) return true;
  const powers = (station?.Connections ?? []).map((c: any) => toNum(c?.PowerKW, 0));
  return powers.some((p: number) => p >= minPower);
}

// ----- handler ---------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    // Accept either explicit bbox (north/south/east/west) or center+radius
    const north = toNum(sp.get('north'), NaN);
    const south = toNum(sp.get('south'), NaN);
    const east = toNum(sp.get('east'), NaN);
    const west = toNum(sp.get('west'), NaN);
    const hasBounds = [north, south, east, west].every((v) => Number.isFinite(v));

    const latParam = toNum(sp.get('lat'), NaN);
    const lonParam = toNum(sp.get('lon'), NaN);
    const distParam = Math.max(1, toNum(sp.get('dist'), 10)); // km
    const minPower = Math.max(0, toNum(sp.get('minPower'), 0));
    const conn = sp.get('conn') ?? '';

    const sourceParam = (sp.get('source') ?? '').toLowerCase();
    const includeOCM = !sourceParam || sourceParam === 'ocm' || sourceParam === 'all';
    const includeCouncil = !sourceParam || sourceParam === 'council' || sourceParam === 'all';

    // NEW: configurable minimum radius when a bbox is provided (prevents tiny queries)
    const minRadiusFromEnv = Number(process.env.OCM_MIN_RADIUS_KM);
    const MIN_RADIUS_KM = Number.isFinite(minRadiusFromEnv) ? Math.max(1, minRadiusFromEnv) : 5;
    const minRadiusOverride = toNum(sp.get('minRadius'), NaN); // optional query override for testing
    const EFFECTIVE_MIN_RADIUS = Number.isFinite(minRadiusOverride)
      ? Math.max(1, minRadiusOverride)
      : MIN_RADIUS_KM;

    let lat: number;
    let lon: number;
    let dist: number;

    if (hasBounds) {
      lat = (north + south) / 2;
      lon = (east + west) / 2;

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

      // 👇 key fix: enforce a larger minimum radius (default 5 km)
      dist = Math.max(EFFECTIVE_MIN_RADIUS, maxCornerDist);
    } else {
      lat = latParam;
      lon = lonParam;
      dist = distParam;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return new Response(JSON.stringify({ error: 'Missing lat/lon' }), { status: 400 });
      }
    }

    // Build OCM request
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

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Autodun-EV-Finder/1.0 (contact: info@autodun.com)',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      // Fail soft but surface a hint for the client banner
      return new Response(JSON.stringify({ error: `OCM ${res.status}`, items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    const raw = (await res.json().catch(() => [])) as any[];
    const items = Array.isArray(raw) ? raw : [];

    const ocmFiltered = items.filter((s) => {
      if (!includeOCM) return false;
      if (!matchesConnector(s, conn)) return false;
      if (!hasMinPower(s, minPower)) return false;

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

    // Council data (optional)
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
      } catch {
        councilStations = [];
      }
    }

    const councilFiltered = councilStations.filter((s) => {
      if (!includeCouncil) return false;
      if (!matchesConnector(s, conn)) return false;
      if (!hasMinPower(s, minPower)) return false;
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
            typeof s?.StatusType?.IsOperational === 'boolean' ? s?.StatusType?.IsOperational : null,
        },
        Feedback: (() => {
          const store: Record<number, { rating: number; comment?: string; timestamp: number }[]> =
            (globalThis as any).__feedbackStore ?? {};
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
    const trimmedCouncil = councilFiltered.map((r) => ({ ...trimRecord(r), DataSource: 'Council' }));

    const out = [...trimmedOCM, ...trimmedCouncil];

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
    // Fail soft to keep UI responsive
    return new Response(JSON.stringify({ error: 'Server error', items: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
}

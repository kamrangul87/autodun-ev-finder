import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

// ---------- helpers ----------
const norm = (s: unknown) =>
  String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

const toNum = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Haversine distance (km)
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

// gather as much connector text as possible from a station
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

// Match station against connector dropdown
function matchesConnector(station: any, connQuery: string): boolean {
  const q = norm(connQuery);
  if (!q) return true; // “Any”

  const hay = connectorText(station);

  // “Type 2” can be labeled as “Type 2”, “Mennekes”, “Type2”
  if (q === 'type 2' || q.includes('type 2')) {
    return /type\s*2|mennekes/.test(hay);
  }

  // CCS appears as CCS / Combo / Combined Charging System / Type 2 Combo
  if (q === 'ccs' || q.includes('ccs')) {
    return /ccs|combo|combined(\s+charging\s+system)?|type\s*2\s*combo/.test(hay);
  }

  // CHAdeMO (sometimes spelled chademo)
  if (q === 'chademo' || q.includes('chademo')) {
    return /chade?mo/.test(hay);
  }

  // Fallback: if a custom text is ever passed, do a simple includes
  return hay.includes(q);
}

// Has at least one connection with required minPower
function hasMinPower(station: any, minPower: number): boolean {
  if (!minPower) return true;
  const powers = (station?.Connections ?? []).map((c: any) => toNum(c?.PowerKW, 0));
  return powers.some((p: number) => p >= minPower);
}

// ---------- handler ----------
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const lat = toNum(sp.get('lat'));
    const lon = toNum(sp.get('lon'));
    const dist = Math.max(1, toNum(sp.get('dist'), 10)); // km
    const minPower = Math.max(0, toNum(sp.get('minPower'), 0));
    const conn = sp.get('conn') ?? '';

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return new Response(JSON.stringify({ error: 'Missing lat/lon' }), { status: 400 });
    }

    // Build verbose OCM request so we get ConnectionType names
    const params = new URLSearchParams({
      output: 'json',
      countrycode: 'GB',
      latitude: String(lat),
      longitude: String(lon),
      distance: String(dist),
      distanceunit: 'KM',
      maxresults: '200',
      compact: 'false',
      verbose: 'true',
      includecomments: 'false',
    });

    // Optional API key (either var name works)
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
      // Fail soft so UI shows “no results” rather than crashing
      return new Response(JSON.stringify([]), { status: 200 });
    }

    const raw = await res.json().catch(() => []) as any[];
    const items = Array.isArray(raw) ? raw : [];

    // Apply filters
    const filtered = items.filter(
      (s) => matchesConnector(s, conn) && hasMinPower(s, minPower)
    );

    // Trim payload and add distance
    const out = filtered.map((s: any) => {
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
        _distanceKm: distanceKm,
      };
    });

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify([]), { status: 200 });
  }
}

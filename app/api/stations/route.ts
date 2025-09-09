import { NextRequest } from 'next/server';

// Small helpers
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
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(la1) * Math.cos(la2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return Math.round((R * c) * 10) / 10;
}

// Match station against connector query
function matchesConnector(station: any, connQuery: string): boolean {
  const cq = norm(connQuery);
  if (!cq) return true; // “Any”

  const labels: string[] = (station?.Connections ?? []).map((c: any) =>
    norm(c?.ConnectionType?.FormalName || c?.ConnectionType?.Title)
  );

  // “Type 2” can be labeled as “Type 2”, “Mennekes”, etc.
  if (cq === 'type 2') {
    return labels.some((t: string) => t.includes('type 2') || t.includes('mennekes'));
  }

  // CCS may appear as CCS, Combo, Combined Charging System, etc.
  if (cq === 'ccs') {
    return labels.some(
      (t: string) => t.includes('ccs') || t.includes('combo') || t.includes('combined')
    );
  }

  // CHAdeMO is usually consistent
  if (cq === 'chademo') {
    return labels.some((t: string) => t.includes('chademo'));
  }

  // Fallback: don’t block results if we don’t recognize the query
  return true;
}

// Has at least one connection with required minPower
function hasMinPower(station: any, minPower: number): boolean {
  if (!minPower) return true;
  const powers = (station?.Connections ?? []).map((c: any) => toNum(c?.PowerKW, 0));
 return powers.some((p: number) => p >= minPower);

}

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

    // Fetch from OpenChargeMap (no key, open endpoint)
   const url =
  `https://api.openchargemap.io/v3/poi/?output=json&countrycode=GB` +
  `&latitude=${lat}&longitude=${lon}&distance=${dist}&distanceunit=KM` +
  `&maxresults=200&compact=false&verbose=true&includecomments=false`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Autodun-EV-Finder/1.0 (contact: info@autodun.com)',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `OCM ${res.status}` }), { status: 502 });
    }

    const raw = (await res.json()) as any[];

    // Filter by connector + min power
    const filtered = raw.filter((s) => matchesConnector(s, conn) && hasMinPower(s, minPower));

    // Trim payload + add distance (if missing)
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
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}

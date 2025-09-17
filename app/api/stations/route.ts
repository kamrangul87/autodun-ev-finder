import { NextRequest } from 'next/server';

// Force this route to always run dynamically.  Without this flag Next.js
// might attempt to statically optimise the endpoint and therefore skip
// runtime evaluation of search parameters.
export const dynamic = 'force-dynamic';

// -----------------------------------------------------------------------------
// Helper functions

// Normalise a value into a lowercase, space‑normalised string.  Undefined
// values become empty strings.
const norm = (s: unknown) =>
  String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// Convert an arbitrary value into a number.  If the value isn't finite
// (e.g. undefined, null, NaN), fall back to the provided default.
const toNum = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Haversine distance (km) between two lat/lon pairs.  Note: this helper
// returns a rounded result to one decimal place to match the original API.
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

// Gather connector text across multiple fields to improve matching.  The
// OpenChargeMap API returns various fields such as FormalName, Title,
// Comments and Reference; we normalise all of them and join them with
// separators so that simple substring matching can be used.
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

// Match a station against a connector query.  The API uses this helper to
// implement fuzzy matching for common connector names (CCS, Type 2,
// CHAdeMO).  Unknown queries fall back to a simple includes search.
function matchesConnector(station: any, connQuery: string): boolean {
  const q = norm(connQuery);
  if (!q) return true; // “Any”

  const hay = connectorText(station);

  // “Type 2” can be labelled as “Type 2”, “Mennekes”, “Type2”
  if (q === 'type 2' || q.includes('type 2')) {
    return /type\s*2|mennekes/.test(hay);
  }

  // CCS appears as CCS / Combo / Combined Charging System / Type 2 Combo
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

// Determine whether a station has at least one connection with the
// specified minimum power requirement.  A minimum power of 0 means “any”.
function hasMinPower(station: any, minPower: number): boolean {
  if (!minPower) return true;
  const powers = (station?.Connections ?? []).map((c: any) => toNum(c?.PowerKW, 0));
  return powers.some((p: number) => p >= minPower);
}

// -----------------------------------------------------------------------------
// GET handler

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    // Parse optional bounding box parameters.  If all four are finite, we
    // interpret the request as a bounding query; otherwise we fall back to
    // lat/lon/dist (centre + radius) behaviour.
    const north = toNum(sp.get('north'), NaN);
    const south = toNum(sp.get('south'), NaN);
    const east = toNum(sp.get('east'), NaN);
    const west = toNum(sp.get('west'), NaN);
    const hasBounds = [north, south, east, west].every((v) => Number.isFinite(v));

    // Parse centre‑based parameters as a fallback or for backwards compatibility.
    const latParam = toNum(sp.get('lat'), NaN);
    const lonParam = toNum(sp.get('lon'), NaN);
    const distParam = Math.max(1, toNum(sp.get('dist'), 10)); // km
    const minPower = Math.max(0, toNum(sp.get('minPower'), 0));
    const conn = sp.get('conn') ?? '';

    // Determine desired data sources.  The default is to return both OpenChargeMap
    // (OCM) stations and any council-provided stations that are bundled with
    // this project.  Users can pass `source=ocm` or `source=council` to limit
    // results to one dataset.  Any other value or absence of the parameter
    // includes all sources.
    const sourceParam = (sp.get('source') ?? '').toLowerCase();
    const includeOCM = !sourceParam || sourceParam === 'ocm' || sourceParam === 'all';
    const includeCouncil = !sourceParam || sourceParam === 'council' || sourceParam === 'all';

    // Determine which mode we are operating in and compute a suitable centre
    // point and search radius.  If bounds are specified, compute the centre
    // as the midpoint of the bounding box and choose a radius large enough
    // to cover all four corners.  Otherwise, require that lat/lon are
    // provided (with a reasonable default distance).
    let lat: number;
    let lon: number;
    let dist: number;

    if (hasBounds) {
      lat = (north + south) / 2;
      lon = (east + west) / 2;
      // Compute the maximum distance from the centre to any corner of the
      // bounding box to ensure the OCM query encompasses the entire area.  We
      // evaluate all four corners to handle arbitrary orderings of north/south
      // and east/west (e.g. west could be greater than east when crossing
      // the antimeridian).
      const corners = [
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
      // If the box is extremely small the distance could be zero; set a
      // minimum of 1 km to avoid errors with the OCM API.
      dist = Math.max(1, maxCornerDist);
    } else {
      lat = latParam;
      lon = lonParam;
      dist = distParam;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return new Response(JSON.stringify({ error: 'Missing lat/lon' }), { status: 400 });
      }
    }

    // Build verbose OCM request so we get ConnectionType names.  The API
    // parameters are the same regardless of whether we computed the centre via
    // bounds or via direct lat/lon.  We always restrict to UK data (GB) and
    // request verbose output.
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
      // The OpenChargeMap API might return an error (e.g. 403) if the
      // API key is missing or invalid.  We log the error but continue
      // processing so that council data (if any) can still be returned.
      console.error('OpenChargeMap request failed:', res.status);
    }

    const raw = (await res.json().catch(() => [])) as any[];
    const items = Array.isArray(raw) ? raw : [];

    // Apply connector and power filters to the OpenChargeMap data.  Bounding
    // box filtering is also applied here because the OCM API itself only
    // supports radius-based selection.  After the OCM records are trimmed we
    // will optionally append council-provided data.
    const ocmFiltered = items.filter((s) => {
      if (!includeOCM) return false;
      const matchConn = matchesConnector(s, conn);
      const matchPower = hasMinPower(s, minPower);
      if (!matchConn || !matchPower) return false;
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

    // Load council stations from the bundled JSON file.  The file is read
    // synchronously on first request and cached for subsequent calls.
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
        councilStations = globalAny.__councilStationsCache as any[];
      } catch (err) {
        console.error('Failed to read council stations', err);
        councilStations = [];
      }
    }

    // Apply the same connector/power/bounding filters to council data.  Note
    // that council stations are stored in a simplified format already
    // containing AddressInfo, Connections and StatusType.
    const councilFiltered = councilStations.filter((s) => {
      if (!includeCouncil) return false;
      const matchConn = matchesConnector(s, conn);
      const matchPower = hasMinPower(s, minPower);
      if (!matchConn || !matchPower) return false;
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

    // Trim payload and add a distance field relative to the computed centre for
    // both OCM and council data.  Council records may not include an
    // `_distanceKm` property, so we compute it here.  We also mark the
    // `DataSource` on each record.
    function trimRecord(s: any): any {
      const ai = s?.AddressInfo ?? {};
      const sLat = toNum(ai?.Latitude, NaN);
      const sLon = toNum(ai?.Longitude, NaN);

      // Compute distance using either OCM provided distance or fallback to
      // haversine.  Note: this distance is relative to the centre point
      // (computed from bounds or provided lat/lon), not necessarily to the
      // original lat/lon in the query if bounds were used.
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
          IsOperational: typeof s?.StatusType?.IsOperational === 'boolean'
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

    // Optionally, sort by distance ascending when distance is available.  Null
    // distances are placed at the end of the list.
    out.sort((a: any, b: any) => {
      const dA = a._distanceKm;
      const dB = b._distanceKm;
      if (dA == null && dB == null) return 0;
      if (dA == null) return 1;
      if (dB == null) return -1;
      return dA - dB;
    });

    // If no stations matched any filters and the OCM API either returned
    // empty or errored, provide a fallback using all council stations.
    if (out.length === 0 && includeCouncil && councilStations.length) {
      const fallback = councilStations.map(trimRecord);
      return new Response(JSON.stringify(fallback), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify([]), { status: 200 });
  }
}
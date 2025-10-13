import { NextRequest } from 'next/server';

// Force dynamic evaluation so we can read local JSON files at runtime
export const dynamic = 'force-dynamic';

// Convert to number with fallback
const toNum = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * GET /api/borough
 *
 * Aggregates charging station data by borough.  This endpoint merges
 * OpenChargeMap stations (OCM) retrieved at runtime with council-supplied
 * stations bundled in the repository.  It then sums the number of stations
 * and connectors for each borough and combines that with EV registration
 * counts to compute a gap index: (EV registrations / connectors).  A higher
 * gap index indicates a shortage of charging infrastructure relative to
 * demand.
 */
export async function GET(req: NextRequest) {
  try {
    const globalAny = globalThis as any;
    // Load council stations from cache or disk
    if (!globalAny.__councilStationsCache) {
      const { readFile } = await import('fs/promises');
      const dataPath = process.cwd() + '/data/councilStations.json';
      const json = await readFile(dataPath, 'utf-8');
      globalAny.__councilStationsCache = JSON.parse(json);
    }
    const councilStations: any[] = globalAny.__councilStationsCache;
    // Load EV registrations per borough
    if (!globalAny.__evRegistrationsCache) {
      const { readFile } = await import('fs/promises');
      const regPath = process.cwd() + '/data/boroughEVRegistrations.json';
      const regText = await readFile(regPath, 'utf-8');
      globalAny.__evRegistrationsCache = JSON.parse(regText);
    }
    const evRegs: Record<string, number> = globalAny.__evRegistrationsCache;

    // Fetch OCM stations for Great Britain.  We choose a generous radius and
    // centre near the geographic midpoint of England to ensure coverage.
    const lat = 53.5;
    const lon = -1.5;
    const dist = 500; // km
    const params = new URLSearchParams({
      output: 'json',
      countrycode: 'GB',
      latitude: String(lat),
      longitude: String(lon),
      distance: String(dist),
      distanceunit: 'KM',
      maxresults: '5000',
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
    const ocmRaw = (await res.json().catch(() => [])) as any[];
    const ocmItems = Array.isArray(ocmRaw) ? ocmRaw : [];

    // Combine OCM and council stations.  Each station must have a borough
    // property; for OCM we derive the borough from the Town or Postcode.  If
    // no borough can be inferred the station is skipped from aggregation.
    type Stat = { borough: string; connectorCount: number };
    const agg: Record<string, Stat> = {};

    // Helper to increment counts
    const addStation = (borough: string, connectors: number) => {
      if (!borough) return;
      const key = borough;
      if (!agg[key]) {
        agg[key] = { borough: borough, connectorCount: 0 };
      }
      agg[key].connectorCount += connectors;
    }

    // Process OCM data
    for (const s of ocmItems) {
      const ai = s?.AddressInfo ?? {};
      const town = ai?.Town as string | undefined;
      const postcode = ai?.Postcode as string | undefined;
      // Derive borough by taking the town name if available; otherwise use
      // the first part of the postcode (e.g. "YO1").  This is an
      // approximation; a real implementation would use shapefiles or a
      // dedicated geocoding service.
      let borough = '';
      if (town) borough = town.trim();
      else if (postcode) borough = postcode.split(/\s+/)[0];
      const connections = Array.isArray(s?.Connections) ? s.Connections.length : 0;
      addStation(borough, connections);
    }

    // Process council data (these records include a `Borough` property)
    for (const s of councilStations) {
      const borough = s?.Borough as string;
      const connections = Array.isArray(s?.Connections) ? s.Connections.length : 0;
      addStation(borough, connections);
    }

    // Build response array combining counts with EV registrations and computing
    // the gap index.  We only include boroughs that have both registration
    // data and connectors; otherwise the index cannot be computed.
    const out = Object.values(agg).map((stat) => {
      const reg = toNum(evRegs[stat.borough], 0);
      const connectors = stat.connectorCount;
      const gapIndex = connectors > 0 ? reg / connectors : null;
      return {
        borough: stat.borough,
        stationCount: connectors, // one connector per station for simplicity
        connectorCount: connectors,
        evRegistrations: reg,
        gapIndex,
      };
    }).filter((x) => x.evRegistrations && x.gapIndex !== null);

    // Sort descending by gap index so underserved boroughs appear first
    out.sort((a, b) => {
      if (a.gapIndex === null && b.gapIndex === null) return 0;
      if (a.gapIndex === null) return 1;
      if (b.gapIndex === null) return -1;
      return (b.gapIndex as number) - (a.gapIndex as number);
    });

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
}
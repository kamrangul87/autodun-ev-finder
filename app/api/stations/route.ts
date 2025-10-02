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
  const west  = searchParams.get('west');
  const south = searchParams.get('south');
  const east  = searchParams.get('east');
  const north = searchParams.get('north');

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

  const sourceParam = searchParams.get('source')?.toLowerCase() || 'ocm';
  const connParam = searchParams.get('conn')?.toLowerCase() || '';
  const connFilter = connParam.trim();
  let combinedItems: Station[] = [];

  const connectionMatches = (c: any, filter: string): boolean => {
    if (!filter) return true;
    const id = c?.ConnectionTypeID;
    const CTID: Record<number, string> = { 32: 'CCS', 33: 'CCS', 2: 'CHAdeMO', 28: 'Type 2', 30: 'Type 2', 25: 'Tesla', 27: 'Tesla', 1036: 'Tesla', 1030: 'CCS', 1031: 'CCS' };
    if (id && CTID[id]) {
      if (CTID[id].toLowerCase().includes(filter)) return true;
    }
    let text = '';
    if (c?.ConnectionType?.Title) text += c.ConnectionType.Title;
    if (c?.ConnectionType?.FormalName) text += ' ' + c.ConnectionType.FormalName;
    if (c?.Level?.Title) text += ' ' + c.Level.Title;
    if (c?.CurrentType?.Title) text += ' ' + c.CurrentType.Title;
    text = text.toLowerCase();
    return text.includes(filter);
  };

  async function getCouncilStations(): Promise<any[]> {
    const globalAny = globalThis as any;
    if (!globalAny.__councilStationsCache) {
      try {
        const { readFile } = await import('fs/promises');
        const dataPath = process.cwd() + '/data/councilStations.json';
        const text = await readFile(dataPath, 'utf-8');
        globalAny.__councilStationsCache = JSON.parse(text);
      } catch {
        globalAny.__councilStationsCache = [];
      }
    }
    return globalAny.__councilStationsCache as any[];
  }

  const apiKey = process.env.OCM_API_KEY ?? '';
  let lastError = '';

  if (sourceParam !== 'council') {
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
          const rawArray = Array.isArray(json) ? json : [];
          const filteredOCM = connFilter ? rawArray.filter((d: any) => Array.isArray(d.Connections) && d.Connections.some((c: any) => connectionMatches(c, connFilter))) : rawArray;
          const items = normalizeOCM(filteredOCM);
          if (items.length) {
            combinedItems = combinedItems.concat(items);
          } else {
            lastError = 'OCM returned 0 items';
          }
        } else {
          lastError = `OCM ${ocmRes.status}: ${await ocmRes.text().catch(() => '')}`;
        }
      } catch (e: any) {
        lastError = `OCM error: ${e?.message ?? 'unknown'}`;
      }
    } else {
      lastError = 'OPENCHARGEMAP_KEY missing';
    }

    if ((sourceParam === 'ocm' || sourceParam === 'all') && combinedItems.length === 0 && !connFilter) {
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
            combinedItems = combinedItems.concat(items);
            if (sourceParam === 'ocm') {
              return NextResponse.json(
                { items: combinedItems, fallback: true, reason: `Used Overpass. Prior: ${lastError}` },
                { status: 200 }
              );
            }
          }
          if (!items.length) {
            lastError = `Overpass 0 items (prior: ${lastError})`;
          }
        } else {
          lastError = `Overpass ${res.status}: ${await res.text().catch(() => '')}; prior: ${lastError}`;
        }
      } catch (e: any) {
        lastError = `Overpass error: ${e?.message ?? 'unknown'}; prior: ${lastError}`;
      }
    }
  }

  if (sourceParam === 'council' || sourceParam === 'all') {
    const councilData = await getCouncilStations();
    const filteredCouncil = connFilter ? councilData.filter((d: any) => Array.isArray(d.Connections) && d.Connections.some((c: any) => connectionMatches(c, connFilter))) : councilData;
    const councilItems = normalizeOCM(filteredCouncil).map(s => ({ ...s, source: 'council' }));
    if (councilItems.length) {
      combinedItems = combinedItems.concat(councilItems);
    }
  }

  if (combinedItems.length > 0) {
    return NextResponse.json(
      { items: combinedItems, ...(lastError ? { fallback: true, reason: `Partial data. Prior: ${lastError}` } : {}) },
      { status: 200 }
    );
  }

  try {
    const origin = req.nextUrl.origin;
    const fbRes = await fetch(`${origin}/data/ev_heat.json`, { cache: 'no-store' });
    if (fbRes.ok) {
      const fbJson = await fbRes.json();
      return NextResponse.json({ items: Array.isArray(fbJson) ? fbJson : [], fallback: true, reason: lastError || 'Unknown error' }, { status: 200 });
    }
  } catch {}

  return NextResponse.json(mockPayload(lastError || 'Unknown error'), { status: 200 });
}

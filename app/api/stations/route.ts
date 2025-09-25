
export const runtime = 'nodejs';
import { NextResponse } from 'next/server';

function parseBbox(sp: URLSearchParams): [number, number, number, number] | null {
  const n = Number(sp.get('north'));
  const s = Number(sp.get('south'));
  const e = Number(sp.get('east'));
  const w = Number(sp.get('west'));
  if (![n, s, e, w].every(Number.isFinite)) return null;
  if (n <= s || e <= w) return null;
  return [n, s, e, w];
}

function normalizeOCM(p: any) {
  const ai = p?.AddressInfo ?? {};
  const conns = Array.isArray(p?.Connections) ? p.Connections : [];
  const maxPower = conns.reduce((m: number, c: any) => {
    const p = Number(c?.PowerKW ?? 0);
    return isFinite(p) ? Math.max(m, p) : m;
  }, 0);
  const connTitles = conns.map((c: any) => (c?.ConnectionType?.Title ?? '').toLowerCase()).join(',');
  return {
    id: p?.ID ?? null,
    name: ai?.Title ?? null,
  // ...existing code...
    addr: [ai?.AddressLine1, ai?.Town].filter(Boolean).join(', ') || null,
    postcode: ai?.Postcode ?? null,
    breakdown: { reports: 0, downtime: 0, connectors: conns.length },
    power: maxPower || null,
    network: p?.OperatorInfo?.Title ?? null,
    updatedAt: p?.DateLastStatusUpdate ?? null,
    _connTitles: connTitles,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bbox = parseBbox(sp);
  if (!bbox) {
    return NextResponse.json({ error: 'invalid_bbox' }, { status: 400 });
  }
  const [north, south, east, west] = bbox;
  const minPower = Number(sp.get('minPower'));
  const conn = sp.get('conn');
  const connList = conn ? conn.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : null;

  const params = new URLSearchParams({
    boundingbox: `${south},${west},${north},${east}`,
    compact: 'true',

    function parseFloatSafe(val: unknown): number | undefined {
      if (typeof val === 'string') {
        const num = parseFloat(val);
        return isNaN(num) ? undefined : num;
      }
      return undefined;
    }

    function computeBBoxFromCenter(lat: number, lon: number, distKm: number) {
      const earthRadiusKm = 6371;
      const deltaLat = (distKm / earthRadiusKm) * (180 / Math.PI);
      const deltaLon = (distKm / earthRadiusKm) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);
      return {
        north: lat + deltaLat,
        south: lat - deltaLat,
        east: lon + deltaLon,
        west: lon - deltaLon,
      };
    }

    function normalizeOCM(p: any) {
      const ai = p?.AddressInfo ?? {};
      const conns = Array.isArray(p?.Connections) ? p.Connections : [];
      const maxPower = conns.reduce((m: number, c: any) => {
        const p = Number(c?.PowerKW ?? 0);
        return isFinite(p) ? Math.max(m, p) : m;
      }, 0);
      const connTitles = conns.map((c: any) => (c?.ConnectionType?.Title ?? '').toLowerCase()).join(',');
      return {
        id: p?.ID ?? null,
        name: ai?.Title ?? null,
        lat: ai?.Latitude,
        lng: ai?.Longitude,
        addr: [ai?.AddressLine1, ai?.Town].filter(Boolean).join(', ') || null,
        postcode: ai?.Postcode ?? null,
        breakdown: { reports: 0, downtime: 0, connectors: conns.length },
        power: maxPower || null,
        network: p?.OperatorInfo?.Title ?? null,
        updatedAt: p?.DateLastStatusUpdate ?? null,
        _connTitles: connTitles,
      };
    }

    export async function GET(req: Request) {
      const url = new URL(req.url);
      const sp = url.searchParams;

      // Parse bbox
      const north = parseFloatSafe(sp.get('north'));
      const south = parseFloatSafe(sp.get('south'));
      const east = parseFloatSafe(sp.get('east'));
      const west = parseFloatSafe(sp.get('west'));

      // Parse center+dist
      const lat = parseFloatSafe(sp.get('lat'));
      const lon = parseFloatSafe(sp.get('lon'));
      let dist = parseFloatSafe(sp.get('dist'));
      if (dist === undefined) dist = 25;

      let params: Record<string, any> = {
        maxresults: 200,
        compact: true,
        verbose: false,
      };

      let mode: 'bbox' | 'center' | undefined;
      if (
        north !== undefined &&
        south !== undefined &&
        east !== undefined &&
        west !== undefined
      ) {
        // Validate bbox
        if (!(north > south && east > west)) {
          return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
        }
        params.boundingbox = `${north},${south},${east},${west}`;
        mode = 'bbox';
      } else if (lat !== undefined && lon !== undefined) {
        // Validate dist
        if (dist === undefined || isNaN(dist) || dist <= 0) {
          return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
        }
        params.latitude = lat;
        params.longitude = lon;
        params.distance = dist;
        mode = 'center';
      } else {
        return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
      }

      // OCM API key
      const apiKey = process.env.OCM_API_KEY;
      if (apiKey) params.key = apiKey;

      // Build OCM request
      const ocmUrl = new URL('https://api.openchargemap.io/v3/poi/');
      Object.entries(params).forEach(([k, v]) => ocmUrl.searchParams.set(k, String(v)));

      let ocmStatus = 200;
      let items: any[] = [];
      try {
        const resp = await fetch(ocmUrl.toString(), { headers: { 'Accept': 'application/json' } });
        ocmStatus = resp.status;
        if (resp.status === 401 || resp.status === 429) {
          console.error(`[stations] OCM error ${resp.status} mode=${mode}`);
          return NextResponse.json({ error: 'ocm_unavailable' }, { status: 502 });
        }
        items = await resp.json();
        if (!Array.isArray(items)) items = [];
      } catch (e) {
        console.error(`[stations] OCM fetch failed mode=${mode} err=${e}`);
        return NextResponse.json({ error: 'ocm_unavailable' }, { status: 502 });
      }

      console.log(`[stations] status=${ocmStatus} mode=${mode} count=${items.length}`);
      return NextResponse.json(items);
    }

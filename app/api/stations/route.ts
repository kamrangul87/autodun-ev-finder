import { NextRequest, NextResponse } from 'next/server';

type OCMConnection = {
  ConnectionTypeID?: number;
  ConnectionType?: { Title?: string; FormalName?: string } | null;
  PowerKW?: number | null;
};
type OCMPOI = {
  ID: number;
  AddressInfo?: {
    Title?: string;
    AddressLine1?: string;
    Town?: string;
    Postcode?: string;
    ContactTelephone1?: string;
    RelatedURL?: string;
    Latitude?: number;
    Longitude?: number;
  };
  Connections?: OCMConnection[] | null;
};

const KEY_VARS = ['OCM_API_KEY', 'OPENCHARGEMAP_API_KEY', 'NEXT_PUBLIC_OPENCHARGEMAP_API_KEY'] as const;
function getOCMKey(): string {
  for (const k of KEY_VARS) {
    const v = process.env[k];
    if (v) return v;
  }
  return '';
}

// Map connector names to OCM ConnectionType IDs (covers common variants)
function connToIds(q: string): number[] {
  const c = q.toLowerCase().trim();
  if (!c) return [];
  if (c === 'type 2' || c === 'type2' || c.includes('mennekes')) return [25, 1036]; // socket & tethered
  if (c === 'ccs' || c.includes('combo') || c === 'ccs2') return [33, 32];        // CCS2 & CCS1
  if (c === 'chademo' || c.includes('cha')) return [2];
  return [];
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const lat = parseFloat(url.searchParams.get('lat') ?? '');
    const lon = parseFloat(url.searchParams.get('lon') ?? '');
    const dist = Math.max(1, Math.min(100, parseFloat(url.searchParams.get('dist') ?? '10')));
    const minPower = Math.max(0, parseFloat(url.searchParams.get('minPower') ?? '0'));
    const connRaw = (url.searchParams.get('conn') ?? '').trim();

    // Viewport bbox (preferred)
    const north = parseFloat(url.searchParams.get('north') ?? '');
    const south = parseFloat(url.searchParams.get('south') ?? '');
    const east = parseFloat(url.searchParams.get('east') ?? '');
    const west = parseFloat(url.searchParams.get('west') ?? '');
    const hasBbox = [north, south, east, west].every((n) => Number.isFinite(n));

    const params = new URLSearchParams();
    params.set('countrycode', 'GB'); // you can drop this if you want cross-border results
    params.set('maxresults', '200');
    params.set('compact', 'false');
    params.set('verbose', 'true');

    // Power filter (server-side and hint to OCM)
    if (Number.isFinite(minPower) && minPower > 0) {
      params.set('minpowerkw', String(minPower));
    }

    // Connector filter via IDs (much more reliable)
    const ids = connToIds(connRaw);
    if (ids.length) params.set('connectiontypeid', ids.join(','));

    // Use bounding box if given, else radius
    if (hasBbox) {
      // OCM expects: boundingbox=(lat,lng),(lat2,lng2)  → top-left, bottom-right
      params.set('boundingbox', `(${north},${west}),(${south},${east})`);
    } else if (Number.isFinite(lat) && Number.isFinite(lon)) {
      params.set('latitude', String(lat));
      params.set('longitude', String(lon));
      params.set('distance', String(dist));
      params.set('distanceunit', 'KM');
    } else {
      return NextResponse.json([]); // not enough to query
    }

    const key = getOCMKey();
    if (key) params.set('key', key);

    const ocmUrl = `https://api.openchargemap.io/v3/poi/?${params.toString()}`;
    const r = await fetch(ocmUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) return NextResponse.json([]);

    const data = (await r.json()) as OCMPOI[] | null;
    const list = Array.isArray(data) ? data : [];

    // Trim to essential fields (client is hardened anyway)
    return NextResponse.json(
      list.map((s) => ({
        ID: s.ID,
        AddressInfo: {
          Title: s.AddressInfo?.Title,
          AddressLine1: s.AddressInfo?.AddressLine1,
          Town: s.AddressInfo?.Town,
          Postcode: s.AddressInfo?.Postcode,
          RelatedURL: s.AddressInfo?.RelatedURL,
          ContactTelephone1: s.AddressInfo?.ContactTelephone1,
          Latitude: s.AddressInfo?.Latitude,
          Longitude: s.AddressInfo?.Longitude,
        },
        Connections: (Array.isArray(s.Connections) ? s.Connections : []).map((c) => ({
          ConnectionType: {
            Title: c?.ConnectionType?.Title,
            FormalName: c?.ConnectionType?.FormalName,
          },
          PowerKW: c?.PowerKW ?? null,
        })),
      }))
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json([]);
  }
}

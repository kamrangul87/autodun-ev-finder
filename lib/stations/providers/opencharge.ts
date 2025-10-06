import type { Station } from '../../../types/stations';

const OCM_ENDPOINT = 'https://api.openchargemap.io/v3/poi/';


type OcmPoi = {
  ID: number;
  AddressInfo?: {
    Title?: string;
    Latitude?: number;
    Longitude?: number;
    AddressLine1?: string;
    Postcode?: string;
  };
  Connections?: Array<{
    ConnectionType?: { Title?: string } | null;
    PowerKW?: number | null;
    Quantity?: number | null;
  }> | null;
};

function mapToStation(p: OcmPoi): Station | null {
  const a = p.AddressInfo;
  if (!a?.Latitude || !a?.Longitude) return null;
  return {
    id: p.ID,
    name: a.Title ?? 'EV Charger',
    lat: a.Latitude,
    lng: a.Longitude,
    address: a.AddressLine1 ?? undefined,
    postcode: a.Postcode ?? undefined,
    connectors: (p.Connections ?? []).map(c => ({
      type: c?.ConnectionType?.Title ?? 'Unknown',
      powerKW: c?.PowerKW ?? undefined,
      quantity: c?.Quantity ?? undefined,
    })),
  };
}

async function fetchJson(url: URL, signal?: AbortSignal) {
  const key = process.env.OCM_KEY;
  const headers: Record<string,string> = { Accept: 'application/json' };
  if (key) headers['X-API-Key'] = key; // also attach as query
  const res = await fetch(url.toString(), { headers, signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`OCM ${res.status}`);
  return res.json() as Promise<OcmPoi[]>;
}

export async function ocmByBBox([south, west, north, east]: [number, number, number, number], max = 200) {
  const url = new URL(OCM_ENDPOINT);
  url.searchParams.set('maxresults', String(Math.min(max, 200)));
  url.searchParams.set('compact', 'true');
  url.searchParams.set('verbose', 'false');
  url.searchParams.set('client', process.env.OCM_CLIENT ?? 'autodun-ev-finder');
  if (process.env.OCM_KEY) url.searchParams.set('key', process.env.OCM_KEY!);
  url.searchParams.set('boundingbox', `(${south},${west}),(${north},${east})`);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000);
  try {
    const data = await fetchJson(url, ac.signal);
    const items = data.map(mapToStation).filter(Boolean) as Station[];
    return { items, source: 'OCM_BBOX' };
  } finally { clearTimeout(t); }
}

export async function ocmByRadius(lat: number, lng: number, km = 10, max = 200) {
  const url = new URL(OCM_ENDPOINT);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('distance', String(km));
  url.searchParams.set('distanceunit', 'KM');
  url.searchParams.set('maxresults', String(Math.min(max, 200)));
  url.searchParams.set('compact', 'true');
  url.searchParams.set('verbose', 'false');
  url.searchParams.set('client', process.env.OCM_CLIENT ?? 'autodun-ev-finder');
  if (process.env.OCM_KEY) url.searchParams.set('key', process.env.OCM_KEY!);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000);
  try {
    const data = await fetchJson(url, ac.signal);
    const items = data.map(mapToStation).filter(Boolean) as Station[];
    return { items, source: 'OCM_RADIUS' };
  } finally { clearTimeout(t); }
}

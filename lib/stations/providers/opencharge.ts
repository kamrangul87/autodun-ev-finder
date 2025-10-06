'use server';
import type { Station, Connector } from '../../../types/stations';

const OCM_BASE = 'https://api.openchargemap.io/v3/poi/';
const OCM_KEY = process.env.OCM_KEY;
const OCM_CLIENT = process.env.OCM_CLIENT || 'autodun-ev-finder';

function mapOCMToStation(poi: any): Station {
  return {
    id: poi.ID,
    name: poi.AddressInfo?.Title || '',
    lat: poi.AddressInfo?.Latitude,
    lng: poi.AddressInfo?.Longitude,
    address: poi.AddressInfo?.AddressLine1 || '',
    postcode: poi.AddressInfo?.Postcode || '',
    connectors: Array.isArray(poi.Connections)
      ? poi.Connections.map((c: any) => ({
          type: c.ConnectionType?.Title || '',
          powerKW: c.PowerKW,
          quantity: c.Quantity,
        }))
      : [],
  };
}

export async function fetchStationsOCM({
  lat,
  lng,
  radius,
  bbox,
  max = 200,
}: {
  lat?: number;
  lng?: number;
  radius?: number;
  bbox?: [[number, number], [number, number]];
  max?: number;
}): Promise<Station[]> {
  const params: Record<string, string> = {
    key: OCM_KEY || '',
    client: OCM_CLIENT,
    compact: 'true',
    verbose: 'false',
    maxresults: String(Math.min(max, 200)),
  };
  if (bbox) {
    // OCM expects boundingbox as lat1,lng1,lat2,lng2
    params.boundingbox = `${bbox[0][0]},${bbox[0][1]},${bbox[1][0]},${bbox[1][1]}`;
  } else if (lat && lng && radius) {
    params.latitude = String(lat);
    params.longitude = String(lng);
    params.distance = String(radius);
  }
  const url = `${OCM_BASE}?${new URLSearchParams(params).toString()}`;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      if (res.status === 429 || res.status >= 500) return [];
      throw new Error(`OCM error: ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    // Deduplicate by ID
    const seen = new Set<number>();
    const stations: Station[] = [];
    for (const poi of data) {
      if (poi.ID && !seen.has(poi.ID)) {
        stations.push(mapOCMToStation(poi));
        seen.add(poi.ID);
      }
    }
    return stations;
  } catch (e) {
    return [];
  }
}

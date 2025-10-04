import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SRC = process.env.STATIONS_SOURCE || 'file';
const STATIONS_URL = process.env.STATIONS_URL;
const OCM_API_KEY = process.env.OCM_API_KEY || '';
const OCM_MAX_RESULTS = Number(process.env.OCM_MAX_RESULTS || 200);

type Station = {
  id: string | number;
  lat: number;
  lng: number;
  name?: string;
  address?: string;
  postcode?: string;
  connectors?: number;
  source?: string;
};

function mapAnyToStation(x: any): Station | null {
  if (!x) return null;
  let lat = x.lat ?? x.latitude ?? x?.AddressInfo?.Latitude;
  let lng = x.lng ?? x.lon ?? x.longitude ?? x?.AddressInfo?.Longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const id = x.id ?? x.ID ?? x._id ?? `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const name = x.name ?? x.Title ?? x?.AddressInfo?.Title ?? x?.AddressInfo?.AddressLine1 ?? undefined;
  const address = x.address ?? x?.AddressInfo?.AddressLine1 ?? undefined;
  const postcode = x.postcode ?? x?.AddressInfo?.Postcode ?? undefined;
  const connectors = x.connectors ?? x.NumberOfPoints ?? (Array.isArray(x.Connections) ? x.Connections.length : undefined);
  const source = x.source ?? (x.AddressInfo ? 'ocm' : 'file');
  return { id, lat, lng, name, address, postcode, connectors, source };
}

async function fromFile(): Promise<Station[]> {
  const tryFiles = ['public/data/stations.json', 'public/data/stations.sample.json'];
  for (const p of tryFiles) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const data = JSON.parse(raw);
      const arr = Array.isArray(data) ? data : data.items || [];
      return arr.map(mapAnyToStation).filter(Boolean) as Station[];
    } catch {}
  }
  // final fallback
  return [
    { id:'fallback-1', lat:51.5033, lng:-0.1195, name:'London Eye', connectors:2, source:'fallback' },
    { id:'fallback-2', lat:51.5079, lng:-0.0877, name:'London Bridge', connectors:4, source:'fallback' }
  ];
}

async function fromURL(): Promise<Station[]> {
  if (!STATIONS_URL) return fromFile();
  try {
    const res = await fetch(STATIONS_URL, { cache: 'no-store' });
    const data = await res.json();
    const arr = Array.isArray(data) ? data : data.items || [];
    const mapped = arr.map(mapAnyToStation).filter(Boolean) as Station[];
    return mapped.length ? mapped : fromFile();
  } catch {
    return fromFile();
  }
}

async function fromOCM(searchParams: URLSearchParams): Promise<Station[]> {
  try {
    const bbox = ['north','south','east','west'].every(k => searchParams.get(k));
    let url: string;
    if (bbox) {
      const north = searchParams.get('north'); const south = searchParams.get('south');
      const east = searchParams.get('east'); const west = searchParams.get('west');
      url = `https://api.openchargemap.io/v3/poi/?output=json&countrycode=GB&maxresults=${OCM_MAX_RESULTS}&boundingbox=${south},${west},${north},${east}`;
    } else {
      // default: central London
      url = `https://api.openchargemap.io/v3/poi/?output=json&countrycode=GB&maxresults=${OCM_MAX_RESULTS}&latitude=51.5074&longitude=-0.1278&distance=15&distanceunit=KM`;
    }
    const headers: any = { 'Accept': 'application/json' };
    if (OCM_API_KEY) headers['X-API-Key'] = OCM_API_KEY;
    const res = await fetch(url, { headers, cache: 'no-store' });
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [];
    const mapped = arr.map(mapAnyToStation).filter(Boolean) as Station[];
    return mapped.length ? mapped : fromFile();
  } catch {
    return fromFile();
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let items: Station[] = [];
  if (SRC === 'url') items = await fromURL();
  else if (SRC === 'ocm') items = await fromOCM(searchParams);
  else items = await fromFile();
  return NextResponse.json({ items });
}

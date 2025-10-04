import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs'; import path from 'path';
export const dynamic = 'force-dynamic';
type Station = { id:string|number; lat:number; lng:number; name?:string; address?:string; postcode?:string; connectors?:number; source?:string; };
const SRC = (process.env.STATIONS_SOURCE || 'ocm').toLowerCase();
const STATIONS_URL = process.env.STATIONS_URL || '';
const OCM_API_KEY = process.env.OCM_API_KEY || '';
const OCM_MAX_RESULTS = Number(process.env.OCM_MAX_RESULTS || 1000);

function mapAnyToStation(x:any): Station | null {
  const lat = x?.lat ?? x?.latitude ?? x?.AddressInfo?.Latitude;
  const lng = x?.lng ?? x?.lon ?? x?.longitude ?? x?.AddressInfo?.Longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const id = x?.id ?? x?.ID ?? x?._id ?? `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
  const name = x?.name ?? x?.Title ?? x?.AddressInfo?.Title ?? x?.AddressInfo?.AddressLine1;
  const address = x?.address ?? x?.AddressInfo?.AddressLine1;
  const postcode = x?.postcode ?? x?.AddressInfo?.Postcode;
  const connectors = x?.connectors ?? x?.NumberOfPoints ?? (Array.isArray(x?.Connections) ? x?.Connections.length : undefined);
  const source = x?.source ?? (x?.AddressInfo ? 'ocm' : 'file');
  return { id, lat, lng, name, address, postcode, connectors, source };
}
const tinyFallback = ():Station[] => [
  { id:'fallback-1', lat:51.5033, lng:-0.1195, name:'London Eye', connectors:2, source:'fallback' },
  { id:'fallback-2', lat:51.5079, lng:-0.0877, name:'London Bridge', connectors:4, source:'fallback' }
];
const safeMap = (arr:any[]):Station[] => (arr||[]).map(mapAnyToStation).filter(Boolean) as Station[];

async function fromFile(req: NextRequest): Promise<Station[]> {
  const root = process.cwd();
  const files = [path.join(root,'public','data','stations.json'), path.join(root,'public','data','stations.sample.json')];
  for (const p of files){
    try{ const raw = fs.readFileSync(p,'utf8'); const j = JSON.parse(raw); const arr = Array.isArray(j)? j : j.items || []; const m = safeMap(arr); if (m.length) return m; }catch{}
  }
  try{
    const origin = new URL(req.url).origin;
    for (const u of [`${origin}/data/stations.json`, `${origin}/data/stations.sample.json`]){
      const r = await fetch(u,{cache:'no-store'}); if (r.ok){ const j = await r.json(); const arr = Array.isArray(j)? j : j.items || []; const m = safeMap(arr); if (m.length) return m; }
    }
  }catch{}
  return tinyFallback();
}

async function fromURL(): Promise<Station[]> {
  if (!STATIONS_URL) return tinyFallback();
  try{
    const r = await fetch(STATIONS_URL,{cache:'no-store'}); const j = await r.json();
    const arr = Array.isArray(j)? j : j.items || []; const m = safeMap(arr);
    return m.length ? m : tinyFallback();
  }catch{ return tinyFallback(); }
}

async function fromOCM(): Promise<Station[]> {
  const south = 51.2867, west = -0.5104, north = 51.6919, east = 0.3340;
  const url = `https://api.openchargemap.io/v3/poi/?output=json&countrycode=GB&maxresults=${OCM_MAX_RESULTS}&boundingbox=${south},${west},${north},${east}`;
  try{
    const headers:Record<string,string> = { 'Accept':'application/json' };
    if (OCM_API_KEY) headers['X-API-Key'] = OCM_API_KEY;
    const r = await fetch(url, { headers, cache:'no-store' });
    const j = await r.json();
    const arr = Array.isArray(j)? j : [];
    const m = safeMap(arr);
    return m.length ? m : tinyFallback();
  }catch{ return tinyFallback(); }
}

export async function GET(req: NextRequest){
  let items: Station[] = [];
  if (SRC === 'url') items = await fromURL();
  else if (SRC === 'file') items = await fromFile(req);
  else items = await fromOCM();
  return NextResponse.json({ items });
}

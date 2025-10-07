import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (!q) return Response.json({ error: 'q required' }, { status: 400 });
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q + ', UK');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'autodun-nexus/1.0 (contact: site)' },
    cache: 'no-store',
  });
  if (!res.ok) return Response.json({ error: 'geocode failed' }, { status: 502 });
  const arr = await res.json() as any[];
  if (!arr?.length) return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json({ lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) });
}

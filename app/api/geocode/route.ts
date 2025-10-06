import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (!q) return new Response(JSON.stringify({ error: 'q required' }), { status: 400 });
  try {
    const u = new URL('https://nominatim.openstreetmap.org/search');
    u.searchParams.set('q', q);
    u.searchParams.set('format', 'json');
    u.searchParams.set('limit', '1');
    const r = await fetch(u.toString(), {
      headers: { 'User-Agent': 'Autodun EV Finder' },
      cache: 'no-store',
    });
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr.length) {
      return new Response(JSON.stringify({ error: 'no results' }), { status: 404 });
    }
    const hit = arr[0];
    let bbox: number[] | null = null;
    if (hit.boundingbox && Array.isArray(hit.boundingbox) && hit.boundingbox.length === 4) {
      const raw = hit.boundingbox.map(Number);
      // [south, north, west, east] -> [west, south, east, north]
      bbox = [raw[2], raw[0], raw[3], raw[1]];
    }
    return new Response(JSON.stringify({
      lat: hit.lat,
      lon: hit.lon,
      display_name: hit.display_name,
      bbox
    }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'geocode failed' }), { status: 500 });
  }
}

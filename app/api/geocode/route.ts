// app/api/geocode/route.ts
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/geocode?q=SW1A 1AA
 * Returns { lat, lon, bbox?: [s,n,w,e], display_name }
 */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get('q')?.trim();
    if (!q) {
      return new Response(JSON.stringify({ error: 'Missing q' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '0');
    url.searchParams.set('q', q);

    const r = await fetch(url.toString(), {
      headers: {
        // polite headers; Nominatim prefers an identifiable UA + referer
        'User-Agent': 'Autodun-EV-Finder/1.0 (server geocoder)',
        'Referer': 'https://autodun-ev-finder',
      },
      cache: 'no-store',
    });
    if (!r.ok) {
      return new Response(JSON.stringify({ error: `Upstream ${r.status}` }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      });
    }
    const json = (await r.json()) as any[];
    if (!Array.isArray(json) || json.length === 0) {
      return new Response(JSON.stringify({ error: 'No results' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    const hit = json[0];
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    let bbox: [number, number, number, number] | undefined;
    if (Array.isArray(hit.boundingbox) && hit.boundingbox.length === 4) {
      const [s, n, w, e] = hit.boundingbox.map((x: string) => Number(x));
      if ([s, n, w, e].every(Number.isFinite)) bbox = [s, n, w, e];
    }

    return new Response(
      JSON.stringify({
        lat,
        lon,
        bbox,
        display_name: hit.display_name as string,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: 'Geocode failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

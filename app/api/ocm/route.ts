// app/api/ocm/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'edge'; // or 'nodejs' if you prefer

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const distance = searchParams.get('distance') ?? '25'; // km
    const max = searchParams.get('maxresults') ?? '500';
    const country = searchParams.get('countrycode') ?? 'GB';

    if (!lat || !lng) {
      return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    const key = process.env.OCM_API_KEY; // optional
    const upstream =
      `https://api.openchargemap.io/v3/poi/?output=json&countrycode=${country}` +
      `&maxresults=${max}&compact=true&verbose=false&latitude=${lat}&longitude=${lng}` +
      `&distance=${distance}&distanceunit=KM` +
      (key ? `&key=${encodeURIComponent(key)}` : '');

    const res = await fetch(upstream, {
      headers: { 'Content-Type': 'application/json' },
      // Edge runtime fetch is HTTPS-only and CORS-safe server-side
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Upstream error', status: res.status }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        // allow CDN caching a bit while keeping it fresh
        'Cache-Control': 's-maxage=600, stale-while-revalidate=86400',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Proxy failed' }, { status: 500 });
  }
}

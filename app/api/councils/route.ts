import type { Feature, FeatureCollection, Geometry } from 'geojson';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UPSTREAM = process.env.COUNCIL_DATA_URL || '';

type BBox = [number, number, number, number]; // [west, south, east, north]

function emptyFC(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function parseBBox(searchParams: URLSearchParams): BBox | null {
  // separate params
  let w = searchParams.get('west');
  let s = searchParams.get('south');
  let e = searchParams.get('east');
  let n = searchParams.get('north');

  // bbox=west,south,east,north
  if (!(w && s && e && n)) {
    const bbox = searchParams.get('bbox');
    if (bbox) {
      const p = bbox.split(',').map((v) => v.trim());
      if (p.length === 4) [w, s, e, n] = p;
    }
  }

  if (!(w && s && e && n)) return null;

  let W = Number(w), S = Number(s), E = Number(e), N = Number(n);
  if ([W, S, E, N].some((v) => Number.isNaN(v))) return null;

  // normalize if caller swapped
  if (E < W) [W, E] = [E, W];
  if (N < S) [S, N] = [N, S];

  return [W, S, E, N];
}

function testFeature(bbox: BBox): Feature {
  const [W, S, E, N] = bbox;
  const padX = (E - W) * 0.05;
  const padY = (N - S) * 0.05;
  const ring = [
    [W + padX, S + padY],
    [E - padX, S + padY],
    [E - padX, N - padY],
    [W + padX, N - padY],
    [W + padX, S + padY],
  ];
  return {
    type: 'Feature',
    properties: { debug: true },
    geometry: { type: 'Polygon', coordinates: [ring] }, // lon,lat
  };
}

function geomBBox(g: Geometry): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const visit = (c: any) => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      const x = c[0], y = c[1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    } else if (Array.isArray(c)) {
      for (const cc of c) visit(cc);
    }
  };

  // @ts-ignore
  visit((g as any).coordinates);
  return [minX, minY, maxX, maxY];
}

function intersects(a: BBox, b: BBox): boolean {
  const [aw, as, ae, an] = a;
  const [bw, bs, be, bn] = b;
  return !(ae < bw || be < aw || an < bs || bn < as);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bbox = parseBBox(searchParams);
    if (!bbox) {
      return new Response(JSON.stringify(emptyFC()), { status: 200 });
    }

    // quick render test: /api/councils?...&debug=1
    if (searchParams.get('debug') === '1') {
      const fc: FeatureCollection = { type: 'FeatureCollection', features: [testFeature(bbox)] };
      return new Response(JSON.stringify(fc), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (!UPSTREAM) {
      return new Response(JSON.stringify(emptyFC()), { status: 200 });
    }

    const upstream = await fetch(UPSTREAM, { cache: 'no-store' });
    if (!upstream.ok) {
      return new Response(JSON.stringify(emptyFC()), { status: 200 });
    }

    const fc = (await upstream.json()) as FeatureCollection;
    if (!fc?.features?.length) {
      return new Response(JSON.stringify(emptyFC()), { status: 200 });
    }

    // fast bbox clip (use feature bbox if present; else compute)
    const clipped: Feature[] = [];
    for (const f of fc.features) {
      if (!f?.geometry) continue;
      const fb = (f as any).bbox as BBox | undefined;
      const bb = fb && fb.length === 4 ? fb : geomBBox(f.geometry);
      if (intersects(bb, bbox)) clipped.push(f);
    }

    const out: FeatureCollection = { type: 'FeatureCollection', features: clipped };
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('Councils route error:', err);
    return new Response(JSON.stringify(emptyFC()), { status: 200 });
  }
}

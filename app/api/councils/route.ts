import type { Feature, FeatureCollection, Geometry } from 'geojson';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UPSTREAM = process.env.COUNCIL_DATA_URL; // e.g. https://your-domain/data/uk-councils.geojson

type BBox = [number, number, number, number]; // [w,s,e,n]

function emptyFC(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function parseBBox(q: string | null): BBox | null {
  if (!q) return null;
  const parts = q.split(',').map((v) => Number(v.trim()));
  if (parts.length !== 4 || parts.some((v) => Number.isNaN(v))) return null;
  const [w, s, e, n] = parts;
  return [w, s, e, n];
}

function geomBBox(g: Geometry): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function visit(c: any) {
    if (typeof c?.[0] === 'number' && typeof c?.[1] === 'number') {
      const x = c[0], y = c[1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      return;
    }
    for (const ch of c) visit(ch);
  }

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
    const bbox = parseBBox(searchParams.get('bbox'));
    if (!bbox) return new Response(JSON.stringify(emptyFC()), { status: 200 });

    if (!UPSTREAM) return new Response(JSON.stringify(emptyFC()), { status: 200 });

    const upstream = await fetch(UPSTREAM, { cache: 'no-store' });
    if (!upstream.ok) return new Response(JSON.stringify(emptyFC()), { status: 200 });

    const fc = (await upstream.json()) as FeatureCollection;
    if (!fc?.features?.length) return new Response(JSON.stringify(emptyFC()), { status: 200 });

    const clipped: Feature[] = [];
    for (const f of fc.features) {
      if (!f?.geometry) continue;
      const fb = (f as any).bbox as BBox | undefined;
      const bb = fb && fb.length === 4 ? fb : geomBBox(f.geometry);
      if (intersects(bb, bbox)) clipped.push(f);
    }

    const out: FeatureCollection = { type: 'FeatureCollection', features: clipped };
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    console.error('Councils route error:', e);
    return new Response(JSON.stringify(emptyFC()), { status: 200 });
  }
}

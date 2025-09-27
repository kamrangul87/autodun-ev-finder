import type { Feature, FeatureCollection, Geometry } from 'geojson';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * DATA SOURCE STRATEGY
 * --------------------
 * 1) Set an ENV var on Vercel: COUNCIL_DATA_URL -> points to a GeoJSON of UK councils (LADs).
 *    Example types: MultiPolygon/Polygon. Include a "bbox" per feature if possible for speed.
 * 2) If you don't have a URL yet, you can temporarily place a file at
 *    https://<your-domain>/data/uk-councils.geojson and set COUNCIL_DATA_URL to that.
 */

const UPSTREAM = process.env.COUNCIL_DATA_URL; // e.g. https://autodun.com/data/uk-councils.geojson

function emptyFC(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

type BBox = [number, number, number, number]; // [w,s,e,n]

function parseBBox(q: string | null): BBox | null {
  if (!q) return null;
  const parts = q.split(',').map((v) => Number(v.trim()));
  if (parts.length !== 4 || parts.some((v) => Number.isNaN(v))) return null;
  const [w, s, e, n] = parts;
  return [w, s, e, n];
}

function geomBBox(g: Geometry): BBox {
  // compute bbox from coordinates (simple + robust for Polygon/MultiPolygon)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function visitCoords(c: any) {
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      const x = c[0]; // lon
      const y = c[1]; // lat
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      return;
    }
    for (const child of c) visitCoords(child);
  }

  // @ts-ignore - visit nested arrays
  visitCoords((g as any).coordinates);

  return [minX, minY, maxX, maxY];
}

function bboxIntersects(a: BBox, b: BBox): boolean {
  const [aw, as, ae, an] = a;
  const [bw, bs, be, bn] = b;
  return !(ae < bw || be < aw || an < bs || bn < as);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bbox = parseBBox(searchParams.get('bbox'));
    if (!bbox) return new Response(JSON.stringify(emptyFC()), { status: 200 });

    if (!UPSTREAM) {
      // No data source configured yet – return empty set gracefully.
      return new Response(JSON.stringify(emptyFC()), { status: 200 });
    }

    // Fetch upstream geojson (no cache so panning updates instantly)
    const upstream = await fetch(UPSTREAM, { cache: 'no-store' });
    if (!upstream.ok) {
      return new Response(JSON.stringify(emptyFC()), { status: 200 });
    }

    const fc = (await upstream.json()) as FeatureCollection;
    if (!fc?.features?.length) {
      return new Response(JSON.stringify(emptyFC()), { status: 200 });
    }

    // Fast bbox filter (uses feature.bbox if present, else compute)
    const clipped: Feature[] = [];
    for (const f of fc.features) {
      if (!f || (!f.geometry)) continue;
      // prefer precomputed bbox if provided
      const fb = (f as any).bbox as BBox | undefined;
      const bb = fb && fb.length === 4 ? fb : geomBBox(f.geometry);
      if (bboxIntersects(bb, bbox)) clipped.push(f);
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

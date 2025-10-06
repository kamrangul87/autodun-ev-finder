// app/api/councils/route.ts
import type { Feature, FeatureCollection, Geometry } from 'geojson';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ONS_URL = process.env.COUNCIL_GEO_URL ||
  'https://ons-inspire.esriuk.com/arcgis/rest/services/Administrative_Boundaries/Local_Authority_Districts_December_2023_UK_BGC/FeatureServer/0/query?where=UPPER(LAD23NM)%20LIKE%20%27%25LONDON%25%27&outFields=LAD23NM,LAD23CD&outSR=4326&f=geojson';
const STATIC_PATH = process.cwd() + '/data/london-boroughs.geojson';
let cachedGeoJson: FeatureCollection | null = null;
let lastFetch = 0;
const CACHE_MS = 86400 * 1000;

type BBox = [number, number, number, number]; // [west, south, east, north]

function emptyFC(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function parseBBox(searchParams: URLSearchParams): BBox | null {
  let w = searchParams.get('west');
  let s = searchParams.get('south');
  let e = searchParams.get('east');
  let n = searchParams.get('north');

  // also accept bbox=west,south,east,north
  if (!(w && s && e && n)) {
    const bbox = searchParams.get('bbox');
    if (bbox) {
      const p = bbox.split(',').map(v => v.trim());
      if (p.length === 4) [w, s, e, n] = p;
    }
  }
  if (!(w && s && e && n)) return null;

  let W = Number(w), S = Number(s), E = Number(e), N = Number(n);
  if ([W, S, E, N].some(v => Number.isNaN(v))) return null;

  if (E < W) [W, E] = [E, W];
  if (N < S) [S, N] = [N, S];

  return [W, S, E, N];
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

export async function GET() {
  try {
    const now = Date.now();
    if (cachedGeoJson && now - lastFetch < CACHE_MS) {
      return new Response(JSON.stringify(cachedGeoJson), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-used-source': 'cache' },
      });
    }
    let geojson: FeatureCollection | null = null;
    try {
      const upstream = await fetch(ONS_URL, { cache: 'no-store' });
      if (upstream.ok) {
        geojson = await upstream.json();
      }
    } catch {}
    if (!geojson || !geojson.features?.length) {
      // fallback to static file
      try {
        const fs = require('fs');
        const raw = fs.readFileSync(STATIC_PATH, 'utf8');
        geojson = JSON.parse(raw);
      } catch {}
    }
    if (!geojson) geojson = emptyFC();
    cachedGeoJson = geojson;
    lastFetch = now;
    return new Response(JSON.stringify(geojson), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-used-source': geojson === cachedGeoJson ? 'cache' : 'fresh' },
    });
  } catch (e) {
    return new Response(JSON.stringify(emptyFC()), { status: 502 });
  }
}

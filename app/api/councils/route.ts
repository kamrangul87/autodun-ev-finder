// 👉 replace the top part of your route with this improved parser + optional debug
type BBox = [number, number, number, number]; // [w,s,e,n]

function parseBBox(searchParams: URLSearchParams): BBox | null {
  // 1) separate params
  let w = searchParams.get('west');
  let s = searchParams.get('south');
  let e = searchParams.get('east');
  let n = searchParams.get('north');

  // 2) bbox=west,south,east,north
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

  // normalize in case caller swapped
  if (E < W) [W, E] = [E, W];
  if (N < S) [S, N] = [N, S];

  return [W, S, E, N];
}

// add this tiny helper anywhere above GET:
function testFeature(bbox: BBox): any {
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
    geometry: { type: 'Polygon', coordinates: [ring] }, // lon,lat order
  };
}

// then inside GET:
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bbox = parseBBox(searchParams);
    if (!bbox) return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200 });

    // ✅ quick debug: prove render path without touching dataset
    if (searchParams.get('debug') === '1') {
      return new Response(JSON.stringify({
        type: 'FeatureCollection',
        features: [testFeature(bbox)],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    // ...keep your existing UPSTREAM fetch + clipping logic exactly as you have it...
}

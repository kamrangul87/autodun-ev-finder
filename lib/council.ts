// lib/council.ts
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";

export type CouncilHit = {
  name: string;
  code: string;
  bbox: [number, number, number, number]; // [minLng,minLat,maxLng,maxLat]
  geom: Polygon | MultiPolygon;
};

let _cache: { list: CouncilHit[] } | null = null;

function computeBbox(geom: Polygon | MultiPolygon): [number, number, number, number] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const scan = (coords: number[][][]) => {
    for (const ring of coords) for (const [x, y] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  };
  if ((geom as Polygon).type === "Polygon") scan((geom as Polygon).coordinates);
  else for (const poly of (geom as MultiPolygon).coordinates) scan(poly);
  return [minX, minY, maxX, maxY];
}

function pointInRing(pt: [number, number], ring: number[][]) {
  // ray casting, lng=X lat=Y
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
function pointInPolygon(pt: [number, number], geom: Polygon | MultiPolygon) {
  if (geom.type === "Polygon") {
    const [outer, ...holes] = geom.coordinates;
    if (!pointInRing(pt, outer)) return false;
    for (const h of holes) if (pointInRing(pt, h)) return false;
    return true;
  }
  for (const poly of geom.coordinates) {
    const [outer, ...holes] = poly;
    if (pointInRing(pt, outer)) {
      for (const h of holes) if (pointInRing(pt, h)) return false;
      return true;
    }
  }
  return false;
}

export async function loadCouncils(): Promise<CouncilHit[]> {
  if (_cache) return _cache.list;
  // geojson file placed in /public/data/councils.geojson (eng+wal+scot ni)
  const res = await fetch("/data/councils.geojson", { cache: "force-cache" });
  const gj = (await res.json()) as FeatureCollection;
  const list: CouncilHit[] = gj.features.map((f: Feature) => {
    const name = String((f.properties as any)?.name ?? (f.properties as any)?.NAME ?? "Unknown");
    const code = String((f.properties as any)?.code ?? (f.properties as any)?.CODE ?? name.toLowerCase().replace(/\s+/g, "-"));
    const geom = f.geometry as Polygon | MultiPolygon;
    return { name, code, geom, bbox: computeBbox(geom) };
  });
  _cache = { list };
  return list;
}

export async function getCouncilByCode(code: string): Promise<CouncilHit | null> {
  const list = await loadCouncils();
  return list.find((c) => c.code === code) ?? null;
}

export async function getCouncilAtPoint(lat: number, lng: number): Promise<CouncilHit | null> {
  const list = await loadCouncils();
  const pt: [number, number] = [lng, lat];
  // quick bbox prefilter
  for (const c of list) {
    const [minX, minY, maxX, maxY] = c.bbox;
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
    if (pointInPolygon(pt, c.geom)) return c;
  }
  return null;
}

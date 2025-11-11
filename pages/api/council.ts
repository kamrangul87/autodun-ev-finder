// pages/api/council.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import type { Feature, Geometry } from "geojson";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supa = createClient(url, serviceRole, { auth: { persistSession: false } });

type BBox = [number, number, number, number]; // [minLng,minLat,maxLng,maxLat]
type FC = { type: "FeatureCollection"; features: CouncilFeature[] };

type CouncilProps = {
  id: any;
  name: any;
  code: any;
  bbox?: BBox; // <-- explicitly part of the props type
};

type CouncilFeature = Feature<Geometry, CouncilProps>;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const mode = String(req.query.mode || "bbox");

  try {
    if (mode === "bbox") {
      const { data, error } = await supa
        .from("council_geojson")
        .select("id,name,code,geometry");

      if (error) return res.status(500).json({ ok: false, error: error.message });

      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      return res.status(200).json(asFCWithBboxes(data || []));
    }

    if (mode === "code") {
      const code = String(req.query.code || "");
      if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

      const one = await supa
        .from("council_geojson")
        .select("id,name,code,geometry")
        .eq("code", code)
        .single();

      if (one.error) return res.status(404).json({ ok: false, error: "not_found" });

      const feature = asFeatureWithBBox(one.data);
      if (!feature) return res.status(404).json({ ok: false, error: "not_found" });

      const bbox: BBox =
        feature.properties?.bbox || computeBBoxFromGeometry(feature.geometry);

      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      return res.status(200).json({ ok: true, feature, bbox });
    }

    if (mode === "point") {
      const lat = num(req.query.lat);
      const lng = num(req.query.lng);

      const cents = await loadCentroids();

      // NO lat/lng: list of centroids (include code)
      if (!isFinite(lat) || !isFinite(lng)) {
        const items = cents
          .map((r) => {
            const c = extractLngLat(r);
            if (!c) return null;
            return {
              id: r.id,
              name: r.name ?? r.code ?? "Council",
              code: r.code ?? null,
              lat: c.lat,
              lng: c.lng,
            };
          })
          .filter(Boolean);
        res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
        return res.status(200).json({ ok: true, items });
      }

      // WITH lat/lng: nearest council feature (+bbox)
      const nearest = nearestByPoint(
        cents
          .map((r) => ({ ...r, ...extractLngLat(r) }))
          .filter((r: any) => isFinite(r.lat) && isFinite(r.lng)),
        [lng, lat]
      );

      if (!nearest) {
        res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
        return res.status(200).json({ ok: true, feature: null, bbox: null });
      }

      const one = await supa
        .from("council_geojson")
        .select("id,name,code,geometry")
        .eq("id", nearest.id)
        .single();

      if (one.error) return res.status(500).json({ ok: false, error: one.error.message });

      const feature = asFeatureWithBBox(one.data);
      const bbox: BBox | null = feature
        ? feature.properties?.bbox || computeBBoxFromGeometry(feature.geometry)
        : null;

      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      return res.status(200).json({ ok: true, feature, bbox });
    }

    return res.status(400).json({ ok: false, error: "Unknown mode" });
  } catch (e: any) {
    console.error("/api/council error", e?.message || e);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}

/* ---------- helpers ---------- */

function asFC(rows: any[]): FC {
  return {
    type: "FeatureCollection",
    features: (rows || []).map(asFeature).filter(Boolean) as CouncilFeature[],
  };
}

function asFCWithBboxes(rows: any[]): FC {
  return {
    type: "FeatureCollection",
    features: (rows || []).map(asFeatureWithBBox).filter(Boolean) as CouncilFeature[],
  };
}

function asFeature(r: any): CouncilFeature | null {
  if (!r) return null;
  return {
    type: "Feature",
    properties: { id: r.id, name: r.name, code: r.code },
    geometry: r.geometry as Geometry,
  };
}

function asFeatureWithBBox(r: any): CouncilFeature | null {
  const f = asFeature(r);
  if (!f) return null;
  const bbox = computeBBoxFromGeometry(f.geometry);
  f.properties.bbox = bbox; // safe: bbox exists in CouncilProps
  return f;
}

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Try live first, then static */
async function loadCentroids(): Promise<any[]> {
  const live = await supa
    .from("council_centroids_live")
    .select("id,name,code,lat,lng,centroid")
    .limit(5000);

  if (!live.error && live.data && live.data.length) return live.data;

  const stat = await supa
    .from("council_centroids")
    .select("id,name,code,lat,lng,centroid")
    .limit(5000);

  if (stat.error) {
    return [];
  }
  return stat.data || [];
}

/** Extract a usable lng/lat from various shapes/columns */
function extractLngLat(r: any): { lng: number; lat: number } | null {
  if (isFinite(r?.lng) && isFinite(r?.lat)) return { lng: Number(r.lng), lat: Number(r.lat) };

  const lng =
    firstFinite(r?.lon, r?.long, r?.longitude) ??
    (Array.isArray(r?.centroid?.coordinates) ? Number(r.centroid.coordinates[0]) : undefined);
  const lat =
    firstFinite(r?.latitude) ??
    (Array.isArray(r?.centroid?.coordinates) ? Number(r.centroid.coordinates[1]) : undefined);

  if (isFinite(lng as number) && isFinite(lat as number)) return { lng: lng as number, lat: lat as number };
  return null;
}

function firstFinite(...vals: any[]): number | undefined {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function nearestByPoint(rows: any[], [lng, lat]: [number, number]) {
  let best: any = null;
  let bestD = Infinity;
  for (const r of rows) {
    const x = Number(r.lng);
    const y = Number(r.lat);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const d = (x - lng) ** 2 + (y - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

/** Compute [minLng,minLat,maxLng,maxLat] from a GeoJSON Polygon/MultiPolygon */
function computeBBoxFromGeometry(geom: Geometry | null | undefined): BBox {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;

  const scan = (coords: number[][][]) => {
    for (const ring of coords) {
      for (const pt of ring) {
        const x = pt[0], y = pt[1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  };

  if (!geom) return [minX, minY, maxX, maxY];

  if (geom.type === "Polygon") {
    scan((geom as any).coordinates as number[][][]);
  } else if (geom.type === "MultiPolygon") {
    for (const poly of (geom as any).coordinates as number[][][][]) scan(poly as any);
  } else if (geom.type === "GeometryCollection" && Array.isArray((geom as any).geometries)) {
    for (const g of (geom as any).geometries) {
      const b = computeBBoxFromGeometry(g as Geometry);
      minX = Math.min(minX, b[0]);
      minY = Math.min(minY, b[1]);
      maxX = Math.max(maxX, b[2]);
      maxY = Math.max(maxY, b[3]);
    }
  }

  return [minX, minY, maxX, maxY];
}

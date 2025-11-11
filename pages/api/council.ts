// pages/api/council.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supa = createClient(url, serviceRole, { auth: { persistSession: false } });

type FC = { type: "FeatureCollection"; features: any[] };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const mode = String(req.query.mode || "bbox");

  try {
    if (mode === "bbox") {
      // MVP: return all councils (lightweight simplified GeoJSON)
      const { data, error } = await supa
        .from("council_geojson")
        .select("id,name,code,geometry");
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json(asFC(data || []));
    }

    if (mode === "point") {
      // When lat/lng provided -> nearest feature (existing behavior)
      const lat = num(req.query.lat);
      const lng = num(req.query.lng);

      // Load centroids (live preferred, fallback to static)
      const cents = await loadCentroids();

      // NO lat/lng: return the list of centroids for map markers
      if (!isFinite(lat) || !isFinite(lng)) {
        const items = cents
          .map((r) => {
            const c = extractLngLat(r);
            if (!c) return null;
            return {
              id: r.id,
              name: r.name ?? r.code ?? "Council",
              lat: c.lat,
              lng: c.lng,
            };
          })
          .filter(Boolean);
        return res.status(200).json({ items });
      }

      // WITH lat/lng: return nearest council's full GeoJSON feature
      const nearest = nearestByPoint(
        cents.map((r) => ({ ...r, ...extractLngLat(r) })).filter((r: any) => isFinite(r.lat) && isFinite(r.lng)),
        [lng, lat]
      );
      if (!nearest) return res.status(200).json({ ok: true, feature: null });

      const one = await supa
        .from("council_geojson")
        .select("id,name,code,geometry")
        .eq("id", nearest.id)
        .single();

      if (one.error) return res.status(500).json({ ok: false, error: one.error.message });
      return res.status(200).json({ ok: true, feature: asFeature(one.data) });
    }

    return res.status(400).json({ ok: false, error: "Unknown mode" });
  } catch (e: any) {
    console.error("/api/council error", e?.message || e);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}

/* ---------- helpers ---------- */

function asFC(rows: any[]): FC {
  return { type: "FeatureCollection", features: (rows || []).map(asFeature).filter(Boolean) };
}

function asFeature(r: any) {
  if (!r) return null;
  return { type: "Feature", properties: { id: r.id, name: r.name, code: r.code }, geometry: r.geometry };
}

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Try live first, then static */
async function loadCentroids(): Promise<any[]> {
  // Try council_centroids_live (columns may be: id,name,code,lat,lng) 
  const live = await supa
    .from("council_centroids_live")
    .select("id,name,code,lat,lng,centroid")
    .limit(5000);

  if (!live.error && live.data && live.data.length) return live.data;

  // Fallback to council_centroids (columns may be: id,name,code,centroid)
  const stat = await supa
    .from("council_centroids")
    .select("id,name,code,lat,lng,centroid")
    .limit(5000);

  if (stat.error) {
    // Return empty on failure; caller will handle
    return [];
  }
  return stat.data || [];
}

/** Extract a usable lng/lat from various shapes/columns */
function extractLngLat(r: any): { lng: number; lat: number } | null {
  // Direct numeric columns
  if (isFinite(r?.lng) && isFinite(r?.lat)) return { lng: Number(r.lng), lat: Number(r.lat) };

  // Common alternates
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

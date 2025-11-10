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
      const { data, error } = await supa.from("council_geojson").select("id,name,code,geometry");
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json(asFC(data || []));
    }

    if (mode === "point") {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ ok: false, error: "Invalid lat/lng" });
      }

      // Nearest-by-centroid fallback (fast + simple for MVP)
      const { data: cents, error } = await supa
        .from("council_centroids")
        .select("id,name,code,centroid")
        .limit(2000);
      if (error) return res.status(500).json({ ok: false, error: error.message });

      const nearest = nearestByPoint(cents || [], [lng, lat]);
      if (!nearest) return res.status(200).json({ ok: true, feature: null });

      const one = await supa.from("council_geojson").select("id,name,code,geometry").eq("id", nearest.id).single();
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
function nearestByPoint(rows: any[], [lng, lat]: [number, number]) {
  let best: any = null;
  let bestD = Infinity;
  for (const r of rows) {
    const c = r.centroid?.coordinates || r.centroid;
    if (!c || !Array.isArray(c)) continue;
    const d = (c[0] - lng) ** 2 + (c[1] - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

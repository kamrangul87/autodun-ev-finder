// pages/api/cron/ml-score-sync.ts
import supabase from "../../../lib/supabaseAdmin";

export const config = { runtime: "nodejs" };
export const dynamic = "force-dynamic";

async function computeScore(payload: any) {
  try {
    const mod = await import("../../../ml/scorer");
    const predict = (mod as any).predict || (mod as any).default;
    if (typeof predict !== "function") return null;

    // light features; fallback-safe
    const features = {
      power_kw: Number(payload?.power_kw ?? 50),
      n_connectors: Number(payload?.n_connectors ?? payload?.connectors ?? 1),
      has_fast_dc: payload?.has_fast_dc ? 1 : 0,
      rating: Number(payload?.rating ?? 4.2),
      usage_score: Number(payload?.usage_score ?? 0),
      has_geo: Number.isFinite(payload?.lat) && Number.isFinite(payload?.lng) ? 1 : 0,
    };
    const out = await predict(features);
    if (!out || typeof out.score !== "number") return null;
    return { score: out.score, modelVersion: out.modelVersion ?? "v1" };
  } catch (e) {
    console.warn("[ml-score-sync] compute skipped:", (e as any)?.message || e);
    return null;
  }
}

export default async function handler(_req, res) {
  // If Supabase not configured, do nothing (safe no-op)
  if (!supabase) {
    return res.status(200).json({ ok: true, rowsUpdated: 0, note: "Supabase not configured" });
  }

  try {
    // fetch a small batch where ml_score IS NULL
    const { data: rows, error } = await supabase
      .from("feedback")
      .select("id, station_id, lat, lng, ml_score, comment, vote")
      .is("ml_score", null)
      .limit(250);

    if (error) throw error;

    let updated = 0;
    for (const r of rows || []) {
      const out = await computeScore({ lat: r.lat, lng: r.lng });
      if (!out) continue;

      const { error: upErr } = await supabase
        .from("feedback")
        .update({ ml_score: out.score, model_version: out.modelVersion })
        .eq("id", r.id);

      if (!upErr) updated++;
      await new Promise(r => setTimeout(r, 50)); // gentler on DB
    }

    return res.status(200).json({ ok: true, rowsUpdated: updated });
  } catch (e: any) {
    console.error("[cron/ml-score-sync] error", e?.message || e);
    return res.status(200).json({ ok: false, error: String(e) });
  }
}

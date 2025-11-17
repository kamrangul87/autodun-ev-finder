// pages/api/score-batch.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { insertAudit, insertScore } from "../../server/db";
// predictScore is an alias to `predict` from ml/scorer
import { predict as predictScore } from "../../ml/scorer";

type Ok = { ok: true; results: { stationId: string; score: number }[]; model: string };
type Err = { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const stationIds: Array<string | number> = Array.isArray(body.stationIds) ? body.stationIds : [];

    if (!stationIds.length) {
      return res.status(400).json({ ok: false, error: "stationIds (array) required" });
    }

    // Minimal deterministic features (replace with real per-station features when available)
    const baseFeatures = {
      power_kw: 0,
      n_connectors: 0,
      has_fast_dc: 0,
      rating: 0,
      usage_score: 0,
      has_geo: 0,
    };

    const results: { stationId: string; score: number }[] = [];
    let model = "unknown";

    for (const id of stationIds) {
      try {
        const out = await predictScore(baseFeatures);
        const score = Math.max(0, Math.min(1, Number(out.score ?? 0.5)));
        model = (out as any).modelVersion || (out as any).model || model;

        // 🔧 Type fix: ensure string for DB call
        const stationIdStr = String(id);

        await insertScore({ station_id: stationIdStr, score, model_version: String(model) });
        results.push({ stationId: stationIdStr, score });
      } catch (e: any) {
        await insertAudit({
          action: "score-batch-error",
          payload: { station_id: String(id), error: String(e?.message || e) },
        });
      }
    }

    return res.status(200).json({ ok: true, results, model });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}

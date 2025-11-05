// pages/api/ml/predict.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { predict } from "../../../ml/scorer";

export const config = { runtime: "nodejs" };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const out = predict({
      power_kw: Number(body.power_kw ?? 0),
      n_connectors: Number(body.n_connectors ?? 0),
      has_fast_dc: body.has_fast_dc ? 1 : 0,
      rating: Number(body.rating ?? 4.2),
      usage_score: Number(body.usage_score ?? 0),
      has_geo: body.has_geo ? 1 : 0,
    });
    return res.status(200).json(out);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

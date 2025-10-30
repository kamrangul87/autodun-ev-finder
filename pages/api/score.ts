// pages/api/score.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { LruTTL } from "../../utils/lru";
import { scoreRequested, scoreReturned } from "../../utils/telemetry";

const SCORER_URL = process.env.NEXT_PUBLIC_SCORER_URL; // base (no /score)
const SCORER_KEY = process.env.AUTODUN_SCORER_KEY || "";
const ENABLED = String(process.env.NEXT_PUBLIC_SCORER_ENABLED) === "true";

const cache = new LruTTL<string, any>(800, 30 * 60 * 1000); // 30m TTL

function keyFromBody(b: any) {
  const canonical = {
    power_kw: Number(b?.power_kw ?? 0),
    n_connectors: Number(b?.n_connectors ?? 0),
    has_fast_dc: Number(b?.has_fast_dc ?? 0),
    rating: Number(b?.rating ?? 0),
    usage_score: Number(b?.usage_score ?? 0),
    has_geo: Number(b?.has_geo ?? 0),
  };
  return JSON.stringify(canonical);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!ENABLED || !SCORER_URL || !SCORER_KEY) {
    return res.status(200).json({
      score: 0.5,
      model: "disabled",
      features_used: ["power_kw","n_connectors","has_fast_dc","rating","usage_score","has_geo"],
      fellBack: true,
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const stationId = req.query.stationId as string | undefined;

    scoreRequested({ stationId, src: "api/score", features: body });

    const k = keyFromBody(body);
    const hit = cache.get(k);
    if (hit) {
      res.setHeader("X-Cache", "HIT");
      scoreReturned({ stationId, score: hit?.score, cache: "HIT" });
      return res.status(200).json({ ...hit, cache: "HIT" });
    }

    const t0 = Date.now();
    const r = await fetch(`${SCORER_URL.replace(/\/$/, "")}/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Autodun-Key": SCORER_KEY,
      },
      body: JSON.stringify(body),
      // Node 18+/20+: AbortSignal.timeout exists. If your env lacks it, remove this line.
      signal: AbortSignal.timeout(5000),
    });

    if (!r.ok) {
      res.setHeader("X-Cache", "MISS");
      return res.status(200).json({
        score: 0.5,
        model: "degraded",
        features_used: ["power_kw","n_connectors","has_fast_dc","rating","usage_score","has_geo"],
        fellBack: true,
      });
    }

    const out = await r.json();
    cache.set(k, out);
    res.setHeader("X-Cache", "MISS");
    scoreReturned({ stationId, score: out?.score, cache: "MISS", ms: Date.now() - t0 });
    return res.status(200).json(out);
  } catch (err: any) {
    console.error("[/api/score] error", err?.message || err);
    return res.status(200).json({
      score: 0.5,
      model: "error-fallback",
      features_used: ["power_kw","n_connectors","has_fast_dc","rating","usage_score","has_geo"],
      fellBack: true,
    });
  }
}

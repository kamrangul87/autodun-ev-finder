// pages/api/score.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { LruTTL } from "../../utils/lru";
import { scoreRequested, scoreReturned } from "../../utils/telemetry";
import { predict } from "../../ml/scorer";

// ✅ NEW: tiny helpers for optional persistence (add file in Step 2)
import { insertScore, insertAudit } from "../../server/db";

const ENABLED = String(process.env.NEXT_PUBLIC_SCORER_ENABLED) === "true";

// ──────────────────────────────────────────────────────────────
// 30m TTL cache for identical feature vectors
// ──────────────────────────────────────────────────────────────
const cache = new LruTTL<string, any>(800, 30 * 60 * 1000);

// ──────────────────────────────────────────────────────────────
function canonicalizeFeatures(b: any) {
  return {
    power_kw: Number(b?.power_kw ?? 0),
    n_connectors: Number(b?.n_connectors ?? 0),
    has_fast_dc: Number(b?.has_fast_dc ?? 0),
    rating: Number(b?.rating ?? 0),
    usage_score: Number(b?.usage_score ?? 0),
    has_geo: Number(b?.has_geo ?? 0),
  };
}
function keyFromBody(b: any) {
  return JSON.stringify(canonicalizeFeatures(b));
}

// ──────────────────────────────────────────────────────────────
// ✅ NEW: super-simple in-memory IP rate-limit (60 req / min)
// ──────────────────────────────────────────────────────────────
const ipHits = new Map<string, { n: number; t: number }>();
const WINDOW_MS = 60_000;
const LIMIT = 60;
function rateLimit(ip: string) {
  const now = Date.now();
  const row = ipHits.get(ip) ?? { n: 0, t: now };
  if (now - row.t > WINDOW_MS) {
    row.n = 0;
    row.t = now;
  }
  row.n++;
  ipHits.set(ip, row);
  return { ok: row.n <= LIMIT, remaining: Math.max(0, LIMIT - row.n) };
}

// ──────────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ✅ NEW: apply simple rate-limit
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
  const rl = rateLimit(ip);
  res.setHeader("X-RateLimit-Limit", String(LIMIT));
  res.setHeader("X-RateLimit-Remaining", String(rl.remaining));
  if (!rl.ok) return res.status(429).json({ error: "rate_limited" });

  // If the scorer is disabled by flag, return a stable fallback
  if (!ENABLED) {
    return res.status(200).json({
      score: 0.5,
      model: "disabled",
      features_used: ["power_kw", "n_connectors", "has_fast_dc", "rating", "usage_score", "has_geo"],
      fellBack: true,
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const stationId = (req.query.stationId as string) || undefined;

    // ✅ NEW: optional extras for audit/persist (all optional)
    const lat = req.query.lat != null ? Number(req.query.lat) : undefined;
    const lng = req.query.lng != null ? Number(req.query.lng) : undefined;
    const persist = String(req.query.persist ?? "").toLowerCase() === "true";

    const features = canonicalizeFeatures(body);
    scoreRequested({ stationId, src: "api/score", features });

    // Cache
    const k = keyFromBody(body);
    const hit = cache.get(k);
    if (hit) {
      res.setHeader("X-Cache", "HIT");
      scoreReturned({ stationId, score: hit?.score, cache: "HIT" });

      // ✅ NEW: best-effort audit on cache hit (non-blocking)
      insertAudit("score_cache_hit", { stationId, ip }).catch(() => {});
      return res.status(200).json({ ...hit, cache: "HIT" });
    }

    const t0 = Date.now();

    // Local, deterministic prediction (no network)
    const out = predict({
      power_kw: features.power_kw,
      n_connectors: features.n_connectors,
      has_fast_dc: features.has_fast_dc,
      rating: features.rating,
      usage_score: features.usage_score,
      has_geo: features.has_geo,
    });

    const response = {
      ok: true,
      score: out.score,
      model: out.modelVersion, // keep "model" field name for backwards compatibility
      features_used: ["power_kw", "n_connectors", "has_fast_dc", "rating", "usage_score", "has_geo"],
    };

    cache.set(k, response);
    res.setHeader("X-Cache", "MISS");
    scoreReturned({ stationId, score: out.score, cache: "MISS", ms: Date.now() - t0 });

    // ✅ NEW: optional persistence (non-blocking, does not affect response)
    if (persist) {
      insertScore({
        station_id: stationId ?? "(unknown)",
        score: Number(out.score ?? 0.5),
        model_version: String(out.modelVersion ?? "local"),
        lat,
        lng,
      }).catch(() => {});
      insertAudit("score_persist", { stationId, ip, lat, lng }).catch(() => {});
    }

    return res.status(200).json(response);
  } catch (err: any) {
    console.error("[/api/score] error", err?.message || err);
    return res.status(200).json({
      score: 0.5,
      model: "error-fallback-local",
      features_used: ["power_kw", "n_connectors", "has_fast_dc", "rating", "usage_score", "has_geo"],
      fellBack: true,
    });
  }
}

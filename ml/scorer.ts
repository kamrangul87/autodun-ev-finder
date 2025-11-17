// ml/scorer.ts

export type Features = {
  power_kw: number;          // e.g. 50, 120
  n_connectors: number;      // e.g. 1..8
  has_fast_dc: number;       // 0 | 1
  rating: number;            // 0..5 (fallback 4.2)
  usage_score: number;       // keep for compatibility (0..1)
  has_geo: number;           // 0 | 1
};

export type PredictOutput = {
  ok: true;
  // ⬇ score is optional now; we leave it undefined so API skips ml_score
  score?: number;
  modelVersion: string;
  normalized: Record<string, number>;
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

/**
 * Placeholder scorer:
 * - Normalises features (for future real models),
 * - BUT intentionally does NOT return a numeric score.
 *
 * In /api/feedback:
 *   if (typeof out.score === "number") -> sets mlScore
 * So with score = undefined, mlScore is skipped, and the
 * dashboard shows "ML —" instead of "ML 36".
 */
export function predict(features: Features): PredictOutput {
  const normalized: Record<string, number> = {
    power_kw: clamp01((features.power_kw ?? 0) / 150),   // soft cap, just for debug
    n_connectors: clamp01((features.n_connectors ?? 0) / 8),
    has_fast_dc: features.has_fast_dc ? 1 : 0,
    rating: clamp01((features.rating ?? 0) / 5),
    usage_score: clamp01(features.usage_score ?? 0),
    has_geo: features.has_geo ? 1 : 0,
  };

  return {
    ok: true,
    score: undefined,             // 👈 key: no numeric score
    modelVersion: "v1-placeholder",
    normalized,
  };
}

export default predict;

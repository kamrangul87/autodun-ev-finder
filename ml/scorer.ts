// ml/scorer.ts
import fs from "node:fs";
import path from "node:path";

export type Features = {
  power_kw: number;          // e.g. 50, 120
  n_connectors: number;      // e.g. 1..8
  has_fast_dc: number;       // 0 | 1
  rating: number;            // 0..5 (fallback 4.2)
  usage_score: number;       // keep for compatibility (0..1), not weighted by default
  has_geo: number;           // 0 | 1
};

export type PredictOutput = {
  ok: true;
  score: number;             // 0..1
  modelVersion: string;
  normalized: Record<string, number>;
};

type Model = {
  version: string;
  bias: number;
  weights: Record<string, number>;
  caps: { power_kw_max: number; n_connectors_max: number; rating_max: number; };
};

let MODEL: Model;

function loadModel(): Model {
  if (MODEL) return MODEL;
  const p = path.join(process.cwd(), "ml", "model.json");
  const raw = fs.readFileSync(p, "utf8");
  MODEL = JSON.parse(raw);
  return MODEL;
}

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

export function predict(features: Features): PredictOutput {
  const m = loadModel();

  // Normalize to 0..1 with caps
  const n: Record<string, number> = {
    power_kw: clamp01((features.power_kw ?? 0) / m.caps.power_kw_max),
    n_connectors: clamp01((features.n_connectors ?? 0) / m.caps.n_connectors_max),
    has_fast_dc: features.has_fast_dc ? 1 : 0,
    rating: clamp01((features.rating ?? 0) / m.caps.rating_max),
    has_geo: features.has_geo ? 1 : 0,
    usage_score: clamp01(features.usage_score ?? 0), // currently not in weights, kept for compatibility
  };

  // Weighted sum
  const scoreRaw =
    (m.weights.power_kw ?? 0) * n.power_kw +
    (m.weights.n_connectors ?? 0) * n.n_connectors +
    (m.weights.has_fast_dc ?? 0) * n.has_fast_dc +
    (m.weights.rating ?? 0) * n.rating +
    (m.weights.has_geo ?? 0) * n.has_geo +
    (m.bias ?? 0);

  const score = clamp01(scoreRaw);
  return { ok: true, score, modelVersion: m.version, normalized: n };
}

// pages/api/feedback.js

export const config = { runtime: "nodejs" };
export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────
   Light CORS (same file; no extra dependency)
   ────────────────────────────────────────────────────────────── */
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/* ──────────────────────────────────────────────────────────────
   Supabase (server-side) — optional if env not set
   ────────────────────────────────────────────────────────────── */
let supabase = null;
try {
  const { createClient } = require("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceRole) {
    supabase = createClient(url, serviceRole, { auth: { persistSession: false } });
  } else {
    console.warn("[feedback] Supabase env missing; DB insert will be skipped.");
  }
} catch (e) {
  console.warn("[feedback] Supabase not initialised (missing pkg or env).");
}

/* ──────────────────────────────────────────────────────────────
   Utilities
   ────────────────────────────────────────────────────────────── */
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const toNum = (v) => (typeof v === "number" ? v : Number(v));
const cleanStr = (s, max = 800) =>
  (s == null ? "" : String(s)).replace(/\s+/g, " ").slice(0, max).trim();

function normalizeVote(v) {
  const s = String(v || "").toLowerCase().trim();
  if (["up", "good", "positive", "👍"].includes(s)) return "good";
  if (["down", "bad", "negative", "👎"].includes(s)) return "bad";
  return s || undefined;
}

function safeIso(v) {
  try {
    const d = new Date(v);
    return isFinite(d.getTime()) ? d.toISOString() : null;
  } catch {
    return null;
  }
}

/* ──────────────────────────────────────────────────────────────
   Handler
   ────────────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    const {
      stationId,
      council,
      councilId,
      vote,
      text,
      comment,
      lat,
      lng,
      zoom,
      ts,
      timestamp,
      type,
      source,
      mlScore,
      modelVersion,

      // optional feature inputs (if client sends)
      power_kw,
      n_connectors,
      has_fast_dc,
      rating,
      usage_score,
    } = body;

    // Normalize & sanitize
    const normVote = normalizeVote(vote);
    const normLat = Number.isFinite(toNum(lat)) ? toNum(lat) : undefined;
    const normLng = Number.isFinite(toNum(lng)) ? toNum(lng) : undefined;
    const normZoom = Number.isFinite(toNum(zoom)) ? clamp(toNum(zoom), 0, 22) : undefined;

    const feedbackData = {
      stationId: stationId ?? councilId ?? null,
      council: Boolean(council) || undefined,
      vote: normVote,
      type: type || (normVote ? "vote" : "council"),
      text: cleanStr(text || comment || "", 800),
      source: cleanStr(source || "unknown", 40),
      lat: normLat,
      lng: normLng,
      zoom: normZoom,
      timestamp: ts || timestamp || new Date().toISOString(),
      userAgent: cleanStr(req.headers["user-agent"] || "", 180),
      mlScore: Number.isFinite(toNum(mlScore)) ? toNum(mlScore) : undefined,
      modelVersion: modelVersion || undefined,
    };

    /* ── Optional local ML scoring (best-effort; non-blocking) ── */
    try {
      const mod = await import("../../ml/scorer");
      const predict = mod.predict || mod.default;
      if (typeof predict === "function") {
        const features = {
          power_kw: Number(power_kw ?? 50),
          n_connectors: Number(n_connectors ?? 1),
          has_fast_dc: has_fast_dc ? 1 : 0,
          rating: Number(rating ?? 4.2),
          usage_score: Number(usage_score ?? 0),
          has_geo: Number.isFinite(normLat) && Number.isFinite(normLng) ? 1 : 0,
        };
        const out = await predict(features);
        if (typeof feedbackData.mlScore !== "number" && typeof out?.score === "number") {
          feedbackData.mlScore = out.score;
        }
        if (!feedbackData.modelVersion && out?.modelVersion) {
          feedbackData.modelVersion = out.modelVersion;
        }
      }
    } catch (e) {
      // fine to skip
      console.warn("[feedback] ML compute skipped:", e?.message || e);
    }

    /* ── Parallel writes: Supabase (if configured) + Webhook (if configured) ── */
    const createdAt = safeIso(feedbackData.timestamp);
    const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;

    const tasks = [];

    if (supabase) {
      tasks.push(
        supabase
          .from("feedback")
          .insert([
            {
              station_id: feedbackData.stationId ? String(feedbackData.stationId) : null,
              vote: feedbackData.vote ?? null,
              comment: feedbackData.text || null,
              source: feedbackData.source || "unknown",
              lat: typeof feedbackData.lat === "number" ? feedbackData.lat : null,
              lng: typeof feedbackData.lng === "number" ? feedbackData.lng : null,
              ml_score: typeof feedbackData.mlScore === "number" ? feedbackData.mlScore : null,
              model_version: feedbackData.modelVersion || "v1",
              user_agent: feedbackData.userAgent || "",
              created_at: createdAt ?? null, // DB default will fill if null
            },
          ])
          .then(({ error }) => {
            if (error) console.error("[feedback] Supabase insert error:", error.message);
          })
          .catch((dbErr) => console.error("[feedback] Supabase insert failed:", dbErr?.message || dbErr))
      );
    }

    if (webhookUrl) {
      tasks.push(
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(feedbackData),
        }).then((r) => {
          if (!r.ok) console.error(`[feedback] Webhook failed: ${r.status}`);
        })
      );
    }

    // Run writes (don’t throw the whole request if one fails)
    await Promise.allSettled(tasks);

    // Always respond JSON so client .json() works
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[API /feedback] Error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to process feedback",
      message: error?.message || String(error),
    });
  }
}

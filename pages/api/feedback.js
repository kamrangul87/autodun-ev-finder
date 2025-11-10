// pages/api/feedback.js

export const config = { runtime: "nodejs" };
export const dynamic = "force-dynamic";

// ──────────────────────────────────────────────────────────────
// Supabase (server-side) — safe to skip if env not set
// ──────────────────────────────────────────────────────────────
let supabase = null;
try {
  const { createClient } = require("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceRole) supabase = createClient(url, serviceRole, { auth: { persistSession: false } });
} catch {
  // package not installed or env missing — proceed without DB
  console.warn("[feedback] Supabase not initialised (missing pkg or env).");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
      // optional if client sends these
      mlScore,
      modelVersion,
    } = body;

    // Base payload (what your app expects)
    const feedbackData = {
      stationId: stationId || councilId,
      council: Boolean(council) || undefined,
      vote: vote || undefined,
      type: type || (vote ? "vote" : "council"),
      text: text || comment || undefined,
      source: source || undefined,
      lat: typeof lat === "number" ? lat : undefined,
      lng: typeof lng === "number" ? lng : undefined,
      zoom: typeof zoom === "number" ? zoom : undefined,
      timestamp: ts || timestamp || new Date().toISOString(),
      userAgent: req.headers["user-agent"] || "",
      mlScore: typeof mlScore === "number" ? mlScore : undefined,
      modelVersion: modelVersion || undefined,
    };

    // 🔮 Best-effort local ML scoring (does not block if it fails)
    try {
      const mod = await import("../../ml/scorer");
      const predict = mod.predict || mod.default;
      if (typeof predict === "function") {
        const features = {
          power_kw: Number(body.power_kw ?? 50),
          n_connectors: Number(body.n_connectors ?? 1),
          has_fast_dc: body.has_fast_dc ? 1 : 0,
          rating: Number(body.rating ?? 4.2),
          usage_score: Number(body.usage_score ?? 0),
          has_geo: (typeof lat === "number" && typeof lng === "number") ? 1 : 0,
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
      console.warn("[feedback] ML compute skipped:", e?.message || e);
    }

    // ──────────────────────────────────────────────────────────
    // NEW: Write to Supabase (non-blocking)
    // ──────────────────────────────────────────────────────────
    if (supabase) {
      try {
        // map to DB columns
        const createdAt = safeIso(feedbackData.timestamp);
        const { error } = await supabase.from("feedback").insert([
          {
            station_id: feedbackData.stationId ? String(feedbackData.stationId) : null,
            vote: feedbackData.vote ?? null,
            comment: feedbackData.text ?? null,
            source: feedbackData.source ?? "unknown",
            lat: typeof feedbackData.lat === "number" ? feedbackData.lat : null,
            lng: typeof feedbackData.lng === "number" ? feedbackData.lng : null,
            ml_score: typeof feedbackData.mlScore === "number" ? feedbackData.mlScore : null,
            model_version: feedbackData.modelVersion ?? "v1",
            user_agent: feedbackData.userAgent ?? "",
            created_at: createdAt ?? null, // DB default will fill if null
          },
        ]);
        if (error) console.error("[feedback] Supabase insert error:", error.message);
      } catch (dbErr) {
        console.error("[feedback] Supabase insert failed:", dbErr?.message || dbErr);
      }
    }

    const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;

    // Forward to Google Apps Script if configured (kept as-is)
    if (webhookUrl) {
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(feedbackData),
        });

        if (!response.ok) {
          console.error(`[feedback] Webhook failed: ${response.status}`);
          console.log(`[feedback] payload: ${JSON.stringify(feedbackData)}`);
        } else {
          console.log(`[feedback] Forwarded to webhook: ${feedbackData.type || "unknown"}`);
        }
        // Always return JSON so client .json() works
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error("[feedback] Webhook error:", err?.message || err);
        console.log(`[feedback] payload: ${JSON.stringify(feedbackData)}`);
        return res.status(200).json({ ok: true, forwarded: false });
      }
    }

    // No webhook -> just log
    console.log(`[feedback] (no webhook) ${JSON.stringify(feedbackData)}`);
    return res.status(200).json({ ok: true, message: "Feedback stored (Supabase) and/or logged" });
  } catch (error) {
    console.error("[API /feedback] Error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to process feedback",
      message: error?.message || String(error),
    });
  }
}

// Small helper to sanitize timestamps
function safeIso(v) {
  try {
    const d = new Date(v);
    return isFinite(d.getTime()) ? d.toISOString() : null;
  } catch {
    return null;
  }
}

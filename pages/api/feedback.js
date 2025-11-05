// pages/api/feedback.js

export const config = { runtime: "nodejs" };
export const dynamic = "force-dynamic";

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

    // Base payload
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
        if (typeof feedbackData.mlScore !== "number") {
          feedbackData.mlScore = (typeof mlScore === "number") ? mlScore : out?.score;
        }
        if (!feedbackData.modelVersion) {
          feedbackData.modelVersion = modelVersion || out?.modelVersion;
        }
      }
    } catch (e) {
      console.warn("[feedback] ML compute skipped:", e?.message || e);
    }

    const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;

    // Forward to Google Apps Script if configured
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
    return res.status(200).json({ ok: true, message: "Feedback logged (no webhook)" });
  } catch (error) {
    console.error("[API /feedback] Error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to process feedback",
      message: error?.message || String(error),
    });
  }
}

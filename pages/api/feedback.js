// pages/api/feedback.ts

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
      // allow clients to pass these, but we'll also compute below
      mlScore,
      modelVersion,
    } = body;

    // Base feedback object
    const feedbackData: any = {
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

    // 🔮 Compute ML score locally (best-effort; non-blocking)
    try {
      const { predict } = await import("../../ml/scorer");
      // Derive minimal feature set; use safe defaults (mirrors StationDrawer features)
      const features = {
        power_kw: Number(body.power_kw ?? 50),
        n_connectors: Number(body.n_connectors ?? 1),
        has_fast_dc: body.has_fast_dc ? 1 : 0,
        rating: Number(body.rating ?? 4.2),
        usage_score: Number(body.usage_score ?? 0),
        has_geo:
          (typeof lat === "number" && typeof lng === "number") ||
          (typeof body.has_geo === "number" ? body.has_geo : 0)
            ? 1
            : 0,
      };
      const out = predict(features);
      feedbackData.mlScore = typeof mlScore === "number" ? mlScore : out.score;
      feedbackData.modelVersion = modelVersion || out.modelVersion;
    } catch (e) {
      // If ML fails, keep flow working; Sheet columns will be blank
      console.warn("[feedback] ML compute skipped:", e?.message || e);
    }

    const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;

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
        return res.status(200).json({ ok: true });
      } catch (webhookError) {
        console.error("[feedback] Webhook error:", webhookError?.message || webhookError);
        console.log(`[feedback] payload: ${JSON.stringify(feedbackData)}`);
        return res.status(200).json({ ok: true, forwarded: false });
      }
    }

    console.log(`[feedback] (no webhook) ${JSON.stringify(feedbackData)}`);
    return res.status(200).json({ ok: true, message: "Feedback logged (no webhook)" });
  } catch (error) {
    console.error("[API /feedback] Error:", error);
    return res.status(500).json({ ok: false, error: "Failed to process feedback", message: error?.message || String(error) });
  }
}

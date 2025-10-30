// pages/api/feedback.ts

export const config = {
  runtime: "nodejs",
};

export const dynamic = "force-dynamic";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Next.js usually parses JSON, but handle string bodies just in case
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

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
    } = body;

    const feedbackData = {
      // prefer explicit stationId; fall back to councilId if present
      stationId: stationId || councilId,
      council: Boolean(council) || undefined,
      vote: vote || undefined,                 // 'good' | 'bad' or any string you pass
      type: type || (vote ? "vote" : "council"),
      text: text || comment || undefined,      // store any freeform text under a single field
      lat: typeof lat === "number" ? lat : undefined,
      lng: typeof lng === "number" ? lng : undefined,
      zoom: typeof zoom === "number" ? zoom : undefined,
      timestamp: ts || timestamp || new Date().toISOString(),
      userAgent: req.headers["user-agent"] || "",
    };

    const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;

    // If a webhook is configured (Google Apps Script), forward it.
    if (webhookUrl) {
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(feedbackData),
        });

        if (!response.ok) {
          // Log, but still return 204 so UI is never blocked
          console.error(`[feedback] Webhook failed with status ${response.status}`);
          console.log(`[feedback] payload: ${JSON.stringify(feedbackData)}`);
        } else {
          console.log(`[feedback] Forwarded to webhook: ${feedbackData.type || "unknown"}`);
        }

        // No content needed back to client; UI already shows toast
        return res.status(204).end();
      } catch (webhookError) {
        console.error("[feedback] Webhook error:", webhookError?.message || webhookError);
        console.log(`[feedback] payload: ${JSON.stringify(feedbackData)}`);
        return res.status(204).end();
      }
    }

    // If no webhook set, just log and acknowledge (useful in Preview)
    console.log(`[feedback] (no webhook) ${JSON.stringify(feedbackData)}`);
    return res.status(200).json({ success: true, message: "Feedback logged" });
  } catch (error) {
    console.error("[API /feedback] Error:", error);
    return res
      .status(500)
      .json({ error: "Failed to process feedback", message: error?.message || String(error) });
  }
}

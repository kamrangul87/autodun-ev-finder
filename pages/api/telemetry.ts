import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const event = req.body;
    // Minimal PII guard
    if (!event?.name || typeof event?.name !== "string") return res.status(400).json({ ok: false, error: "Bad event" });
    // Log to Vercel Functions log (for now). Replace here with your store (BigQuery/Supabase/S3 etc.)
    console.info("[telemetry:event]", JSON.stringify(event));
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("[telemetry:error]", e?.message || e);
    return res.status(200).json({ ok: true }); // never block UI
  }
}

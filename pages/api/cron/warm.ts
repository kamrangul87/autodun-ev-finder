// pages/api/cron/warm.ts
import type { NextApiRequest, NextApiResponse } from "next";

const CRON_SECRET = process.env.CRON_SECRET || "";
const BASE = process.env.CRON_BASE_URL || ""; // e.g. https://your-app.vercel.app

// UK into 4 boxes
const BBOXES = [
  "-8.649,49.823,-3.443,55.334",  // SW
  "-3.443,49.823,1.763,55.334",   // SE
  "-8.649,55.334,-3.443,60.845",  // NW
  "-3.443,55.334,1.763,60.845",   // NE
];

async function warmOne(bbox: string) {
  const url = `${BASE.replace(/\/$/, "")}/api/stations?bbox=${bbox}&tiles=2&limitPerTile=750`;
  const t0 = Date.now();
  try {
    const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "cron-warm/1.0" } });
    const ok = r.ok;
    let count = 0;
    if (ok) {
      const j = await r.json().catch(() => ({}));
      if (Array.isArray(j?.features)) count = j.features.length;
      if (Array.isArray(j?.items)) count = j.items.length;
    }
    return { bbox, ok, count, ms: Date.now() - t0 };
  } catch (e: any) {
    return { bbox, ok: false, error: String(e?.message || e), ms: Date.now() - t0 };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!BASE) return res.status(500).json({ error: "Set CRON_BASE_URL to your production URL" });

  if (CRON_SECRET) {
    const provided = req.headers["x-cron-secret"];
    if (!provided || provided !== CRON_SECRET) return res.status(401).json({ error: "Unauthorized" });
  }

  const results = await Promise.all(BBOXES.map(warmOne));
  return res.status(200).json({ ok: true, warmed: results, ts: Date.now() });
}

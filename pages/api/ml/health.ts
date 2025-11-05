// pages/api/ml/health.ts
import { NextApiRequest, NextApiResponse } from "next";
import fs from "node:fs";
import path from "node:path";

export const config = { runtime: "nodejs" };

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const p = path.join(process.cwd(), "ml", "model.json");
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw);
    const stat = fs.statSync(p);
    return res.status(200).json({
      ok: true,
      modelVersion: j?.version ?? "unknown",
      updatedAt: stat.mtime.toISOString(),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

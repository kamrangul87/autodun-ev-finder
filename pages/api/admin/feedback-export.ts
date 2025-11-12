// pages/api/admin/feedback-export.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getCouncilAtPoint } from "../../../lib/council";

type Row = {
  ts: string | null;
  stationId: string | number | null;
  vote: string;
  comment: string;
  source: string;
  lat: number | null;
  lng: number | null;
  mlScore: number | null;
  modelVersion: string;
  userAgent: string;
};

type ApiData = { ok: boolean; rows: Row[] };

const escapeCSV = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Build a reliable origin (works on Vercel and locally)
    const proto =
      (req.headers["x-forwarded-proto"] as string) ||
      (req.headers["x-forwarded-protocol"] as string) ||
      "https";
    const host = (req.headers["x-forwarded-host"] as string) || req.headers.host;
    const origin = `${proto}://${host}`;

    // Optional: forward some simple filters to the internal API
    const { from, to, min, max, model, source, q } = req.query;
    const params = new URLSearchParams();
    if (typeof from === "string" && from) params.set("from", from);
    if (typeof to === "string" && to) params.set("to", to);
    if (typeof min === "string" && min) params.set("min", min);
    if (typeof max === "string" && max) params.set("max", max);
    if (typeof model === "string" && model) params.set("model", model);
    if (typeof source === "string" && source) params.set("source", source);
    if (typeof q === "string" && q) params.set("q", q);

    const url = `${origin}/api/admin/feedback${params.toString() ? `?${params.toString()}` : ""}`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Upstream /api/admin/feedback failed: ${r.status} ${txt}`);
    }
    const j = (await r.json()) as ApiData;
    const rows = j.rows ?? [];

    const header = [
      "time_iso",
      "station",
      "vote",
      "mlScore",
      "comment",
      "source",
      "lat",
      "lng",
      "model",
      "userAgent",
      "council_name",
      "council_code",
      "region",
      "country",
    ].join(",");

    const out: string[] = [header];

    for (const rr of rows) {
      let council = { name: "", code: "", region: "", country: "" };
      const latOk = Number.isFinite(rr.lat ?? NaN);
      const lngOk = Number.isFinite(rr.lng ?? NaN);

      if (latOk && lngOk) {
        try {
          const hit = await getCouncilAtPoint(Number(rr.lat), Number(rr.lng));
          if (hit) {
            council = {
              name: hit.name ?? "",
              code: hit.code ?? "",
              // region/country are optional in your type
              region: (hit as any).region ?? "",
              country: (hit as any).country ?? "",
            };
          }
        } catch {
          // swallow council lookup errors per row
        }
      }

      const row = [
        rr.ts ? new Date(rr.ts).toISOString() : "",
        rr.stationId ?? "",
        rr.vote ?? "",
        rr.mlScore ?? "",
        rr.comment ?? "",
        rr.source ?? "",
        latOk ? (rr.lat as number).toFixed(6) : "",
        lngOk ? (rr.lng as number).toFixed(6) : "",
        rr.modelVersion ?? "",
        rr.userAgent ?? "",
        council.name,
        council.code,
        council.region,
        council.country,
      ]
        .map(escapeCSV)
        .join(",");

      out.push(row);
    }

    const csv = "\uFEFF" + out.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="feedback-export-${Date.now()}.csv"`);
    res.status(200).send(csv);
  } catch (e: any) {
    console.error("[feedback-export]", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || "export failed" });
  }
}

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
    // Build an absolute URL to THIS deployment and forward cookies, so protection passes.
    const proto =
      (req.headers["x-forwarded-proto"] as string) ||
      (process.env.NODE_ENV === "production" ? "https" : "http");
    const host =
      (req.headers["x-forwarded-host"] as string) ||
      (req.headers.host as string) ||
      process.env.NEXT_PUBLIC_BASE_URL; // optional fallback

    if (!host) {
      throw new Error("Cannot determine host for internal fetch.");
    }

    const url = `${proto}://${host}/api/admin/feedback`;
    const r = await fetch(url, {
      cache: "no-store",
      headers: {
        // Forward auth/protection cookies so the internal call is treated like the user.
        cookie: req.headers.cookie ?? "",
      },
    });

    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Upstream /api/admin/feedback failed: ${r.status} ${r.statusText}\n${text.slice(0, 500)}`);
    }

    const j = (await r.json()) as ApiData;
    const rows = j.rows ?? [];

    const out: string[] = [];
    out.push(
      [
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
      ].join(","),
    );

    for (const r of rows) {
      let council = { name: "", code: "", region: "", country: "" };
      if (Number.isFinite(r.lat ?? NaN) && Number.isFinite(r.lng ?? NaN)) {
        try {
          const hit = await getCouncilAtPoint(Number(r.lat), Number(r.lng));
          if (hit) {
            council = {
              name: hit.name ?? "",
              code: hit.code ?? "",
              region: (hit as any).region ?? "",
              country: (hit as any).country ?? "",
            };
          }
        } catch {
          // council lookup best-effort; keep blanks on failure
        }
      }

      const line = [
        r.ts ? new Date(r.ts).toISOString() : "",
        r.stationId ?? "",
        r.vote ?? "",
        r.mlScore ?? "",
        r.comment ?? "",
        r.source ?? "",
        Number.isFinite(r.lat ?? NaN) ? (r.lat as number).toFixed(6) : "",
        Number.isFinite(r.lng ?? NaN) ? (r.lng as number).toFixed(6) : "",
        r.modelVersion ?? "",
        r.userAgent ?? "",
        council.name,
        council.code,
        council.region,
        council.country,
      ]
        .map(escapeCSV)
        .join(",");
      out.push(line);
    }

    const csv = "\uFEFF" + out.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="feedback-export-${Date.now()}.csv"`);
    return res.status(200).send(csv);
  } catch (err: any) {
    // Return a tiny CSV with the error so the admin sees what happened
    const msg = (err?.message || String(err)).replace(/\s+/g, " ").slice(0, 1000);
    const csv = "\uFEFF" + ["error"].join(",") + "\n" + [`"${msg.replace(/"/g, '""')}"`].join(",");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="feedback-export-error-${Date.now()}.csv"`);
    return res.status(200).send(csv);
  }
}

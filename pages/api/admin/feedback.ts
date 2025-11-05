import type { NextApiRequest, NextApiResponse } from "next";

const READ_URL = process.env.FEEDBACK_READ_URL || "";

type Row = Record<string, any>;

function parseTs(ts: any) {
  // Apps Script returns Date objects as strings; try converting
  const d = new Date(ts);
  return isNaN(+d) ? null : d;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!READ_URL) {
    return res.status(500).json({ ok: false, error: "FEEDBACK_READ_URL not set" });
  }

  try {
    const limit = Number(req.query.limit || 500);
    const url = `${READ_URL}?mode=list&limit=${encodeURIComponent(String(limit))}`;
    const r = await fetch(url, { method: "GET" });
    const data = await r.json();

    const rows: Row[] = Array.isArray(data?.rows) ? data.rows : [];

    // Normalize and compute aggregates
    const normalized = rows.map((r) => {
      // try common header names; your sheet already has these
      const vote = (r.vote || r.Vote || "").toString().toLowerCase();
      const score = typeof r.mlScore === "number" ? r.mlScore : Number(r.mlScore || NaN);
      const ts = r.ts || r.timestamp || r.Timestamp || null;
      const when = ts ? parseTs(ts) : null;
      return {
        ts: when ? when.toISOString() : null,
        stationId: r.stationId || r.councilId || null,
        vote,
        comment: r.comment || r.text || "",
        source: r.source || "",
        lat: typeof r.lat === "number" ? r.lat : Number(r.lat || NaN),
        lng: typeof r.lng === "number" ? r.lng : Number(r.lng || NaN),
        mlScore: Number.isFinite(score) ? score : null,
        modelVersion: r.modelVersion || "",
        userAgent: r.userAgent || "",
      };
    }).filter(Boolean);

    // Aggregates
    let good = 0, bad = 0, scored = 0, scoreSum = 0;
    const byDay = new Map<string, { n: number; scoreSum: number; scored: number }>();

    for (const r of normalized) {
      if (r.vote === "good" || r.vote === "up") good++;
      else if (r.vote === "bad" || r.vote === "down") bad++;

      if (typeof r.mlScore === "number") {
        scored++;
        scoreSum += r.mlScore;
      }

      if (r.ts) {
        const day = r.ts.slice(0, 10); // YYYY-MM-DD
        const cur = byDay.get(day) || { n: 0, scoreSum: 0, scored: 0 };
        cur.n++;
        if (typeof r.mlScore === "number") {
          cur.scored++;
          cur.scoreSum += r.mlScore;
        }
        byDay.set(day, cur);
      }
    }

    const avgScore = scored ? scoreSum / scored : null;
    const timeline = Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, v]) => ({
        day,
        count: v.n,
        avgScore: v.scored ? v.scoreSum / v.scored : null,
      }));

    return res.status(200).json({
      ok: true,
      rows: normalized.reverse(), // newest first
      stats: {
        total: normalized.length,
        good, bad,
        goodPct: normalized.length ? good / normalized.length : 0,
        avgScore,
        timeline,
      },
    });
  } catch (err: any) {
    console.error("[/api/admin/feedback] error", err?.message || err);
    return res.status(500).json({ ok: false, error: "Failed to fetch feedback" });
  }
}

// pages/api/admin/feedback.ts
import type { NextApiRequest, NextApiResponse } from "next";

// ──────────────────────────────────────────────────────────────
// Optional Supabase client (only if env vars are present)
// ──────────────────────────────────────────────────────────────
let supabase: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient } = require("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceRole) {
    supabase = createClient(url, serviceRole, { auth: { persistSession: false } });
  }
} catch {
  // package missing locally or not installed — safe to ignore, we’ll use fallback
  console.warn("[/api/admin/feedback] Supabase not initialized (pkg/env missing).");
}

const READ_URL = process.env.FEEDBACK_READ_URL || "";

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

type ApiData = {
  ok: boolean;
  rows: Row[];
  stats: {
    total: number;
    good: number;
    bad: number;
    goodPct: number; // 0..1
    avgScore: number | null;
    timeline: { day: string; count: number; avgScore: number | null }[];
  };
};

function parseTs(ts: any) {
  try {
    const d = new Date(ts);
    return isNaN(+d) ? null : d;
  } catch {
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiData | { ok: false; error: string }>
) {
  try {
    // Prefer Supabase if configured
    if (supabase) {
      const sinceIso = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("feedback")
        .select("station_id, vote, comment, source, lat, lng, ml_score, model_version, user_agent, created_at")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[/api/admin/feedback] Supabase error:", error.message);
        // fall through to Apps Script if available
      } else if (Array.isArray(data)) {
        const rows: Row[] = data.map((r: any) => ({
          ts: r.created_at ?? null,
          stationId: r.station_id ?? null,
          vote: (r.vote ?? "").toString().toLowerCase(),
          comment: r.comment ?? "",
          source: r.source ?? "",
          lat: typeof r.lat === "number" ? r.lat : r.lat != null ? Number(r.lat) : null,
          lng: typeof r.lng === "number" ? r.lng : r.lng != null ? Number(r.lng) : null,
          mlScore: typeof r.ml_score === "number" ? r.ml_score : r.ml_score != null ? Number(r.ml_score) : null,
          modelVersion: r.model_version ?? "",
          userAgent: r.user_agent ?? "",
        }));

        const payload = buildAggregates(rows);
        return res.status(200).json(payload);
      }
      // if we get here: Supabase enabled but query failed; try fallback if configured
    }

    // Fallback to Apps Script if FEEDBACK_READ_URL is provided
    if (READ_URL) {
      const limit = Number(req.query.limit || 500);
      const url = `${READ_URL}?mode=list&limit=${encodeURIComponent(String(limit))}`;
      const r = await fetch(url, { method: "GET" });
      const data = await r.json();

      const rawRows: Record<string, any>[] = Array.isArray(data?.rows) ? data.rows : [];
      const rows: Row[] = rawRows
        .map((r) => {
          const vote = (r.vote || r.Vote || "").toString().toLowerCase();
          const score =
            typeof r.mlScore === "number" ? r.mlScore : Number(r.mlScore ?? NaN);
          const ts = r.ts || r.timestamp || r.Timestamp || null;
          const when = ts ? parseTs(ts) : null;

          return {
            ts: when ? when.toISOString() : null,
            stationId: r.stationId || r.councilId || null,
            vote,
            comment: r.comment || r.text || "",
            source: r.source || "",
            lat: typeof r.lat === "number" ? r.lat : Number(r.lat ?? NaN),
            lng: typeof r.lng === "number" ? r.lng : Number(r.lng ?? NaN),
            mlScore: Number.isFinite(score) ? score : null,
            modelVersion: r.modelVersion || "",
            userAgent: r.userAgent || "",
          } as Row;
        })
        .filter(Boolean);

      // reverse to newest first to match your existing UI
      const payload = buildAggregates(rows.reverse());
      return res.status(200).json(payload);
    }

    // Neither Supabase nor fallback is available
    return res.status(500).json({ ok: false, error: "No data source configured (Supabase envs or FEEDBACK_READ_URL)." });
  } catch (err: any) {
    console.error("[/api/admin/feedback] error", err?.message || err);
    return res.status(500).json({ ok: false, error: "Failed to fetch feedback" });
  }
}

function buildAggregates(rows: Row[]): ApiData {
  let good = 0,
    bad = 0,
    scored = 0,
    scoreSum = 0;

  const byDay = new Map<string, { n: number; sum: number; cnt: number }>();

  for (const r of rows) {
    const v = (r.vote || "").toLowerCase();
    if (v === "good" || v === "up" || v === "positive") good++;
    else if (v === "bad" || v === "down" || v === "negative") bad++;

    if (typeof r.mlScore === "number" && isFinite(r.mlScore)) {
      scored++;
      scoreSum += r.mlScore;
    }

    if (r.ts) {
      const day = r.ts.slice(0, 10); // YYYY-MM-DD
      const cur = byDay.get(day) ?? { n: 0, sum: 0, cnt: 0 };
      cur.n++;
      if (typeof r.mlScore === "number" && isFinite(r.mlScore)) {
        cur.cnt++;
        cur.sum += r.mlScore;
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
      avgScore: v.cnt ? v.sum / v.cnt : null,
    }));

  return {
    ok: true,
    rows,
    stats: {
      total: rows.length,
      good,
      bad,
      goodPct: rows.length ? good / rows.length : 0,
      avgScore,
      timeline,
    },
  };
}

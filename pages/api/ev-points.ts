// pages/api/ev-points.ts
import type { NextApiRequest, NextApiResponse } from "next";

type OCMComment = {
  Rating?: number | null;               // 0..5 (lower often = problems)
  DateCreated?: string | null;          // ISO
};

type OCM = {
  AddressInfo?: { Latitude?: number; Longitude?: number };
  Connections?: any[];                  // list of connectors
  NumberOfPoints?: number | null;       // sometimes present
  StatusType?: { IsOperational?: boolean } | null;
  UserComments?: OCMComment[] | null;   // only if includecomments=true
};

const WEIGHTS = { reports: 0.5, downtime: 0.3, connectors: 0.2 };

// clamp helper
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Optional params: /api/ev-points?lat=52.5&lon=-1.5&radius=400
  const lat = Number(req.query.lat) || 52.5;
  const lon = Number(req.query.lon) || -1.5;
  const distKm = Math.min(Number(req.query.radius) || 400, 800);

  // Ask OCM for GB points + include comments so we can score "reports"
  const url =
    `https://api.openchargemap.io/v3/poi/` +
    `?output=json&countrycode=GB&latitude=${lat}&longitude=${lon}` +
    `&distance=${distKm}&distanceunit=KM&maxresults=5000` +
    `&compact=true&verbose=false&includecomments=true`;

  const headers: Record<string, string> = {};
  if (process.env.OCM_API_KEY) headers["X-API-Key"] = process.env.OCM_API_KEY;

  try {
    const r = await fetch(url, { headers } as any);
    if (r.status === 429) {
      return res.status(429).json({ error: "OpenChargeMap rate limit (429). Try again shortly." });
    }
    if (!r.ok) throw new Error(`OCM ${r.status}`);

    const raw: OCM[] = await r.json();

    // 1) precompute global max connectors for normalization
    let maxConnectors = 1;
    for (const s of raw) {
      const connectors = s.Connections?.length ?? s.NumberOfPoints ?? 1;
      if (connectors > maxConnectors) maxConnectors = connectors;
    }

    // helper: recent (last 90 days)?
    const isRecent = (iso?: string | null) => {
      if (!iso) return false;
      const d = new Date(iso).getTime();
      if (Number.isNaN(d)) return false;
      const ninetyDays = 90 * 24 * 60 * 60 * 1000;
      return Date.now() - d <= ninetyDays;
    };

    // 2) map to points with weighted score
    const points = raw
      .map((site) => {
        const la = site.AddressInfo?.Latitude;
        const ln = site.AddressInfo?.Longitude;
        if (typeof la !== "number" || typeof ln !== "number") return null;

        // connectors (normalized)
        const connectors = site.Connections?.length ?? site.NumberOfPoints ?? 1;
        const connectorsScore = clamp01(connectors / maxConnectors);

        // reports: count low-rated or unrated comments (cap at 8)
        const comments = site.UserComments ?? [];
        const issueCount = comments.reduce((acc, c) => {
          const rating = c?.Rating ?? 0;                 // treat missing rating as issue
          return acc + (rating <= 3 ? 1 : 0);
        }, 0);
        // small boost if any recent issue reported
        const recentBoost = comments.some(c => isRecent(c.DateCreated)) ? 0.15 : 0;
        const reportsScore = clamp01(issueCount / 8 + recentBoost);

        // downtime: non-operational ⇒ high, operational ⇒ low
        const isUp = site.StatusType?.IsOperational === true;
        const downtimeScore = isUp ? 0.1 : 1.0;

        // final weighted score (0..1)
        const value01 =
          WEIGHTS.reports    * reportsScore +
          WEIGHTS.downtime   * downtimeScore +
          WEIGHTS.connectors * connectorsScore;

        // keep a little floor so markers are plottable
        const value = clamp01(value01) || 0.01;

        // round a bit to shrink payload
        const round = (n: number, dp = 5) => Math.round(n * 10 ** dp) / 10 ** dp;
        return { lat: round(la), lng: round(ln), value: Number(value.toFixed(3)) };
      })
      .filter(Boolean) as Array<{ lat: number; lng: number; value: number }>;

    // Cache at the edge for 1 hour; allow stale for a day
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json(points);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Failed to fetch OCM" });
  }
}

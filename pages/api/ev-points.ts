// pages/api/ev-points.ts
import type { NextApiRequest, NextApiResponse } from "next";

type OCMComment = {
  Rating?: number | null;        // 0..5 (lower often = problems)
  DateCreated?: string | null;   // ISO
};

type OCM = {
  AddressInfo?: { Latitude?: number; Longitude?: number };
  Connections?: any[];
  NumberOfPoints?: number | null;
  StatusType?: { IsOperational?: boolean } | null;
  UserComments?: OCMComment[] | null;
  DateLastStatusUpdate?: string | null;
};

const WEIGHTS = { reports: 0.5, downtime: 0.3, connectors: 0.2 };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.max(0, (Date.now() - t) / (24 * 3600 * 1000));
}
function expDecay(ageDays: number, halfLifeDays: number) {
  // 1 at age=0, 0.5 at age=halfLife, decays smoothly
  const LN2 = Math.log(2);
  return Math.exp(-LN2 * (ageDays / Math.max(1e-6, halfLifeDays)));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // /api/ev-points?lat=52.5&lon=-1.5&radius=400&halfReports=90&halfDown=60
  const lat = Number(req.query.lat) || 52.5;
  const lon = Number(req.query.lon) || -1.5;
  const distKm = Math.min(Number(req.query.radius) || 400, 800);

  const halfReports = Math.max(1, Number(req.query.halfReports) || 90); // days
  const halfDown = Math.max(1, Number(req.query.halfDown) || 60);       // days

  const url =
    `https://api.openchargemap.io/v3/poi/` +
    `?output=json&countrycode=GB&latitude=${lat}&longitude=${lon}` +
    `&distance=${distKm}&distanceunit=KM&maxresults=5000` +
    `&compact=true&verbose=false&includecomments=true`;

  const headers: Record<string, string> = {};
  if (process.env.OCM_API_KEY) headers["X-API-Key"] = process.env.OCM_API_KEY;

  try {
    const r = await fetch(url, { headers } as any);
    if (r.status === 429) return res.status(429).json({ error: "OpenChargeMap rate limit (429). Try again shortly." });
    if (!r.ok) throw new Error(`OCM ${r.status}`);

    const raw: OCM[] = await r.json();

    // normalize connectors
    let maxConnectors = 1;
    for (const s of raw) {
      const c = s.Connections?.length ?? s.NumberOfPoints ?? 1;
      if (c > maxConnectors) maxConnectors = c;
    }

    const points = raw
      .map((site) => {
        const la = site.AddressInfo?.Latitude;
        const ln = site.AddressInfo?.Longitude;
        if (typeof la !== "number" || typeof ln !== "number") return null;

        // connectors (0..1)
        const connectors = site.Connections?.length ?? site.NumberOfPoints ?? 1;
        const connectorsScore = clamp01(connectors / maxConnectors);

        // reports (time-decayed, cap against ref sum)
        const comments = site.UserComments ?? [];
        const refSum = 5; // ~ five recent issues saturate the score
        let sum = 0;
        for (const c of comments) {
          const rating = c?.Rating ?? 0; // missing rating → treat as issue
          if (rating <= 3) {
            const age = daysSince(c?.DateCreated) ?? 3650; // unknown → very old
            sum += expDecay(age, halfReports);
          }
        }
        const reportsScore = clamp01(sum / refSum);

        // downtime (time-decayed from last status update if down)
        const isUp = site.StatusType?.IsOperational === true;
        let downtimeScore = 0.05; // tiny baseline when operational
        if (!isUp) {
          const age = daysSince(site.DateLastStatusUpdate);
          downtimeScore = age == null ? 0.8 : clamp01(expDecay(age, halfDown));
          downtimeScore = Math.max(downtimeScore, 0.25); // never below this if known down
        }

        // final value 0..1
        const value01 =
          WEIGHTS.reports    * reportsScore +
          WEIGHTS.downtime   * downtimeScore +
          WEIGHTS.connectors * connectorsScore;

        const value = clamp01(value01) || 0.01;

        const round = (n: number, dp = 5) => Math.round(n * 10 ** dp) / 10 ** dp;
        return {
          lat: round(la),
          lng: round(ln),
          value: Number(value.toFixed(3)),
          breakdown: {
            reports: Number(reportsScore.toFixed(3)),
            downtime: Number(downtimeScore.toFixed(3)),
            connectors: Number(connectorsScore.toFixed(3)),
          },
        };
      })
      .filter(Boolean) as Array<{ lat: number; lng: number; value: number; breakdown: {reports:number; downtime:number; connectors:number} }>;

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json(points);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Failed to fetch OCM" });
  }
}

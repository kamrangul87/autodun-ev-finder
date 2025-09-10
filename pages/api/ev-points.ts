// pages/api/ev-points.ts
import type { NextApiRequest, NextApiResponse } from "next";

type OCMComment = {
  Rating?: number | null;
  DateCreated?: string | null;
};

type OCMConnection = {
  PowerKW?: number | null;
  Level?: { IsFastChargeCapable?: boolean | null } | null;
  CurrentType?: { Title?: string | null } | null; // "AC" / "DC"
  LevelID?: number | null;                         // often 3 => DC fast
};

type OCM = {
  AddressInfo?: { Latitude?: number; Longitude?: number };
  OperatorInfo?: { Title?: string | null } | null;
  Connections?: OCMConnection[] | null;
  NumberOfPoints?: number | null;
  StatusType?: { IsOperational?: boolean } | null;
  UserComments?: OCMComment[] | null;
  DateLastStatusUpdate?: string | null;
};

const WEIGHTS = { reports: 0.5, downtime: 0.3, connectors: 0.2 };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const LN2 = Math.log(2);

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.max(0, (Date.now() - t) / (24 * 3600 * 1000));
}
function expDecay(ageDays: number, halfLifeDays: number) {
  return Math.exp(-LN2 * (ageDays / Math.max(1e-6, halfLifeDays)));
}
function isDC(c: OCMConnection): boolean {
  const lvlFast = c?.Level?.IsFastChargeCapable === true;
  const currentDC = (c?.CurrentType?.Title || "").toUpperCase().includes("DC");
  const lvlIdDC = c?.LevelID === 3;
  return Boolean(lvlFast || currentDC || lvlIdDC);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // /api/ev-points?cc=GB&lat=52.5&lon=-1.5&radius=400&halfReports=90&halfDown=60
  const cc = (String(req.query.cc || "GB").toUpperCase().trim() || "GB").slice(0, 2);
  const lat = Number(req.query.lat) || 52.5;
  const lon = Number(req.query.lon) || -1.5;
  const distKm = Math.min(Number(req.query.radius) || 400, 800);

  const halfReports = Math.max(1, Number(req.query.halfReports) || 90);
  const halfDown = Math.max(1, Number(req.query.halfDown) || 60);

  const url =
    `https://api.openchargemap.io/v3/poi/` +
    `?output=json&countrycode=${cc}&latitude=${lat}&longitude=${lon}` +
    `&distance=${distKm}&distanceunit=KM&maxresults=5000` +
    `&compact=true&verbose=false&includecomments=true`;

  const headers: Record<string, string> = {};
  if (process.env.OCM_API_KEY) headers["X-API-Key"] = process.env.OCM_API_KEY;

  try {
    const r = await fetch(url, { headers } as any);
    if (r.status === 429) return res.status(429).json({ error: "OpenChargeMap rate limit (429). Try again shortly." });
    if (!r.ok) throw new Error(`OCM ${r.status}`);

    const raw: OCM[] = await r.json();

    // normalize connectors (for connectorsScore normalization)
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

        const operator = (site.OperatorInfo?.Title || "Unknown").trim();

        // per-site power/DC aggregation
        const conns = site.Connections || [];
        const maxKW = conns.reduce((m, c) => Math.max(m, Number(c?.PowerKW || 0)), 0);
        const hasDC = conns.some(isDC);

        // connectors (0..1)
        const connectors = conns.length || site.NumberOfPoints || 1;
        const connectorsScore = clamp01(connectors / maxConnectors);

        // reports (time-decayed)
        const comments = site.UserComments ?? [];
        const refSum = 5; // ~ five recent issues saturate
        let sum = 0;
        for (const c of comments) {
          const rating = c?.Rating ?? 0;  // missing rating ⇒ treat as issue
          if (rating <= 3) {
            const age = daysSince(c?.DateCreated) ?? 3650;
            sum += expDecay(age, halfReports);
          }
        }
        const reportsScore = clamp01(sum / refSum);

        // downtime (time-decayed if down)
        const isUp = site.StatusType?.IsOperational === true;
        let downtimeScore = 0.05;
        if (!isUp) {
          const age = daysSince(site.DateLastStatusUpdate);
          downtimeScore = age == null ? 0.8 : clamp01(expDecay(age, halfDown));
          downtimeScore = Math.max(downtimeScore, 0.25);
        }

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
          op: operator,
          dc: hasDC,
          kw: Math.round(maxKW || 0),
        };
      })
      .filter(Boolean);

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json(points);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Failed to fetch OCM" });
  }
}

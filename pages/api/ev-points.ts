// pages/api/ev-points.ts
import type { NextApiRequest, NextApiResponse } from "next";

type OCM = {
  AddressInfo?: { Latitude?: number; Longitude?: number };
  Connections?: any[];
  NumberOfPoints?: number | null;
  StatusType?: { IsOperational?: boolean } | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Optional params: /api/ev-points?lat=52.5&lon=-1.5&radius=400
  const lat = Number(req.query.lat) || 52.5;
  const lon = Number(req.query.lon) || -1.5;
  const distKm = Math.min(Number(req.query.radius) || 400, 800); // cap radius

  const url =
    `https://api.openchargemap.io/v3/poi/` +
    `?output=json&countrycode=GB&latitude=${lat}&longitude=${lon}` +
    `&distance=${distKm}&distanceunit=KM&maxresults=5000&compact=true&verbose=false`;

  // Optional API key (Vercel → Settings → Environment Variables → OCM_API_KEY)
  const headers: Record<string, string> = {};
  if (process.env.OCM_API_KEY) headers["X-API-Key"] = process.env.OCM_API_KEY;

  try {
    const r = await fetch(url, { headers } as any);
    if (r.status === 429) {
      return res.status(429).json({ error: "OpenChargeMap rate limit (429). Try again shortly." });
    }
    if (!r.ok) throw new Error(`OCM ${r.status}`);

    const data: OCM[] = await r.json();

    const round = (n: number, dp = 5) => Math.round(n * 10 ** dp) / 10 ** dp;

    // Score = connectors × operational multiplier
    const points = data
      .map((site) => {
        const a = site.AddressInfo;
        const lat = a?.Latitude;
        const lng = a?.Longitude;
        if (typeof lat !== "number" || typeof lng !== "number") return null;

        const connectors = site.Connections?.length ?? site.NumberOfPoints ?? 1;
        const operational = site.StatusType?.IsOperational === true ? 1.0 : 0.6;
        const value = Math.max(1, connectors) * operational;

        return { lat: round(lat), lng: round(lng), value: Number(value.toFixed(2)) };
      })
      .filter(Boolean) as Array<{ lat: number; lng: number; value: number }>;

    // Cache at the edge (Vercel) for 1h; serve stale for a day
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json(points);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Failed to fetch OCM" });
  }
}

// pages/api/ev-points.ts
import type { NextApiRequest, NextApiResponse } from "next";

type OCM = {
  AddressInfo?: { Latitude?: number; Longitude?: number };
  Connections?: any[];
  NumberOfPoints?: number | null;
  StatusType?: { IsOperational?: boolean } | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Rough UK-wide search (center + radius)
  const lat = 52.5, lon = -1.5, distKm = 400;

  const url =
    `https://api.openchargemap.io/v3/poi/` +
    `?output=json&countrycode=GB&latitude=${lat}&longitude=${lon}` +
    `&distance=${distKm}&distanceunit=KM&maxresults=5000&compact=true&verbose=false`;

  // Optional: API key (add in Vercel → Settings → Environment Variables → OCM_API_KEY)
  const headers: Record<string, string> = {};
  if (process.env.OCM_API_KEY) headers["X-API-Key"] = process.env.OCM_API_KEY;

  try {
    const r = await fetch(url, { headers, // cache lightly to avoid rate limits
      next: { revalidate: 3600 }
    } as any);
    if (!r.ok) throw new Error(`OCM ${r.status}`);
    const data: OCM[] = await r.json();

    // Score = connectors × operational multiplier
    const points = data
      .map((site) => {
        const lat = site.AddressInfo?.Latitude;
        const lng = site.AddressInfo?.Longitude;
        if (typeof lat !== "number" || typeof lng !== "number") return null;

        const connectors = site.Connections?.length ?? site.NumberOfPoints ?? 1;
        const operational = site.StatusType?.IsOperational === true ? 1.0 : 0.6;
        const value = Math.max(1, connectors) * operational;

        return { lat, lng, value };
      })
      .filter(Boolean);

    res.status(200).json(points);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to fetch OCM" });
  }
}

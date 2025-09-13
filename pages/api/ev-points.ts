// pages/api/ev-points.ts
import type { NextApiRequest, NextApiResponse } from "next";

type OCMConn = {
  PowerKW?: number | null;
  LevelID?: number | null;
  Level?: { Title?: string | null } | null;
  CurrentType?: { Title?: string | null } | null;
  ConnectionType?: { Title?: string | null; FormalName?: string | null } | null;
};

type OCM = {
  ID?: number;
  AddressInfo?: { Title?: string | null; Latitude?: number; Longitude?: number };
  OperatorInfo?: { Title?: string | null } | null;
  Connections?: OCMConn[] | null;
  NumberOfPoints?: number | null;
  StatusType?: { IsOperational?: boolean } | null;
};

function normalizeConnType(title: string | null | undefined): string | null {
  const t = (title || "").toLowerCase();

  if (!t) return null;

  // CCS (a.k.a. Combo)
  if (t.includes("ccs") || t.includes("combo")) return "CCS";

  // CHAdeMO
  if (t.includes("chademo")) return "CHAdeMO";

  // Type 2 (a.k.a. Mennekes / IEC 62196 Type 2)
  if (t.includes("type 2") || t.includes("mennekes") || t.includes("iec 62196")) return "Type 2";

  // Tesla / Supercharger / NACS (treat as Tesla family for now)
  if (t.includes("tesla") || t.includes("supercharger") || t.includes("nacs")) return "Tesla";

  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cc = (req.query.cc as string) || "GB";
  const lat = Number(req.query.lat ?? 52.5);
  const lon = Number(req.query.lon ?? -1.5);
  const distKm = Number(req.query.distKm ?? 400);

  const url =
    `https://api.openchargemap.io/v3/poi/` +
    `?output=json&countrycode=${encodeURIComponent(cc)}` +
    `&latitude=${lat}&longitude=${lon}` +
    `&distance=${distKm}&distanceunit=KM&maxresults=5000&compact=true&verbose=false`;

  const headers: Record<string, string> = {};
  if (process.env.OCM_API_KEY) headers["X-API-Key"] = process.env.OCM_API_KEY;

  try {
    const r = await fetch(url, {
      headers,
      // small cache window to play nicely with the API
      next: { revalidate: 1200 },
    } as any);
    if (!r.ok) throw new Error(`OCM ${r.status}`);
    const data: OCM[] = await r.json();

    const out = data
      .map((site) => {
        const la = site.AddressInfo?.Latitude;
        const ln = site.AddressInfo?.Longitude;
        if (typeof la !== "number" || typeof ln !== "number") return null;

        const conns = site.Connections ?? [];

        // gather types for this site
        const typeSet = new Set<string>();
        let maxKW = 0;
        let anyDC = false;

        for (const c of conns) {
          const t =
            normalizeConnType(c?.ConnectionType?.Title) ||
            normalizeConnType(c?.ConnectionType?.FormalName) ||
            normalizeConnType(c?.Level?.Title) ||
            normalizeConnType(c?.CurrentType?.Title);

          if (t) typeSet.add(t);

          const kw = Number(c?.PowerKW ?? 0);
          if (kw > maxKW) maxKW = kw;

          // mark DC (Level 3 or text hints)
          const lvlTitle = (c?.Level?.Title || "").toLowerCase();
          const curTitle = (c?.CurrentType?.Title || "").toLowerCase();
          const dcLikely = c?.LevelID === 3 || lvlTitle.includes("dc") || lvlTitle.includes("rapid") || curTitle.includes("dc");
          if (dcLikely) anyDC = true;
        }

        const connectors = (conns?.length ?? site.NumberOfPoints ?? 0) || 0;
        const operational = site.StatusType?.IsOperational === true ? 1.0 : 0.6;

        // simple score – log so big hubs don't dominate too much
        const value = Math.max(0.01, Math.log1p(connectors) * operational);

        return {
          id: site.ID ?? null,
          name: site.AddressInfo?.Title ?? null,
          lat: la,
          lng: ln,
          value,
          // minimal breakdown so the tooltip percentages work (connectors drives it)
          breakdown: { reports: 0, downtime: 0, connectors: Math.max(0.1, connectors) },
          op: site.OperatorInfo?.Title ?? null,
          dc: anyDC,
          kw: maxKW || null,
          conn: connectors,
          types: Array.from(typeSet), // <-- key for filtering
        };
      })
      .filter(Boolean);

    res.status(200).json(out);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to fetch OCM" });
  }
}

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

function detectType(c: OCMConn): string | null {
  // Join all possibly useful fields and normalise
  const s = [
    c?.ConnectionType?.Title,
    c?.ConnectionType?.FormalName,
    c?.Level?.Title,
    c?.CurrentType?.Title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!s) return null;

  // CCS (Combo, Combo 2, IEC 62196-3, CCS (Type 1/2), SAE CCS ...)
  if (
    s.includes("ccs") ||
    s.includes("combo") ||
    s.includes("iec 62196-3") ||
    s.includes("type 2 combo") ||
    s.includes("combo 2") ||
    s.includes("ccs (type 2)") ||
    s.includes("ccs (type 1)") ||
    s.includes("sae ccs")
  ) return "CCS";

  // CHAdeMO
  if (s.includes("chademo")) return "CHAdeMO";

  // Type 2 (Mennekes / IEC 62196-2 / socket / tethered variations)
  if (
    s.includes("type 2") ||
    s.includes("type-2") ||
    s.includes("mennekes") ||
    s.includes("iec 62196-2") ||
    s.includes("t2")
  ) return "Type 2";

  // Tesla family (Supercharger / NACS / Tesla proprietary)
  if (s.includes("tesla") || s.includes("supercharger") || s.includes("nacs"))
    return "Tesla";

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
    const r = await fetch(url, { headers, next: { revalidate: 1200 } } as any);
    if (!r.ok) throw new Error(`OCM ${r.status}`);
    const data: OCM[] = await r.json();

    const out = data
      .map((site) => {
        const la = site.AddressInfo?.Latitude;
        const ln = site.AddressInfo?.Longitude;
        if (typeof la !== "number" || typeof ln !== "number") return null;

        const conns = site.Connections ?? [];

        const typeSet = new Set<string>();
        let maxKW = 0;
        let anyDC = false;

        for (const c of conns) {
          const t = detectType(c);
          if (t) typeSet.add(t);

          const kw = Number(c?.PowerKW ?? 0);
          if (kw > maxKW) maxKW = kw;

          // DC heuristic
          const lvlTitle = (c?.Level?.Title || "").toLowerCase();
          const curTitle = (c?.CurrentType?.Title || "").toLowerCase();
          if (c?.LevelID === 3 || lvlTitle.includes("dc") || lvlTitle.includes("rapid") || curTitle.includes("dc")) {
            anyDC = true;
          }
        }

        const connectors = (conns?.length ?? site.NumberOfPoints ?? 0) || 0;
        const operational = site.StatusType?.IsOperational === true ? 1.0 : 0.6;

        // Balanced score (log so very large hubs don’t dominate)
        const value = Math.max(0.01, Math.log1p(connectors) * operational);

        return {
          id: site.ID ?? null,
          name: site.AddressInfo?.Title ?? null,
          lat: la,
          lng: ln,
          value,
          breakdown: { reports: 0, downtime: 0, connectors: Math.max(0.1, connectors) },
          op: site.OperatorInfo?.Title ?? null,
          dc: anyDC,
          kw: maxKW || null,
          conn: connectors,
          types: Array.from(typeSet), // <-- used by the filter
        };
      })
      .filter(Boolean);

    res.status(200).json(out);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to fetch OCM" });
  }
}

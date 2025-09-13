// pages/api/ev-points.ts
import type { NextApiRequest, NextApiResponse } from "next";

type OCMConn = {
  PowerKW?: number | null;
  LevelID?: number | null;
  Level?: { Title?: string | null } | null;
  CurrentType?: { Title?: string | null } | null;
  ConnectionType?: { Title?: string | null; FormalName?: string | null } | null;
  ConnectionTypeID?: number | null; // <-- use numeric IDs too
};

type OCM = {
  ID?: number;
  AddressInfo?: { Title?: string | null; Latitude?: number; Longitude?: number };
  OperatorInfo?: { Title?: string | null } | null;
  Connections?: OCMConn[] | null;
  NumberOfPoints?: number | null;
  StatusType?: { IsOperational?: boolean } | null;
};

// Loose map of common OpenChargeMap ConnectionTypeID values → family
// (covers old + new IDs; unknowns still fall back to string matching)
const CTID: Record<number, "CCS" | "CHAdeMO" | "Type 2" | "Tesla"> = {
  32: "CCS",   // CCS (Type 1)
  33: "CCS",   // CCS (Type 2)
  2:  "CHAdeMO",
  28: "Type 2", // Type 2 (Tethered)
  30: "Type 2", // Type 2 (Socket)
  25: "Tesla",  // Tesla Connector
  27: "Tesla",  // Tesla Supercharger
  // newer / alternate IDs sometimes seen in feeds:
  1036: "Tesla", // NACS
  1030: "CCS",
  1031: "CCS",
};

function detectType(c: OCMConn): string | null {
  // 1) prefer numeric id
  const id = c?.ConnectionTypeID ?? null;
  if (id && CTID[id as number]) return CTID[id as number];

  // 2) fall back to names (very broad)
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
  if (
    s.includes("ccs") || s.includes("combo") || s.includes("iec 62196-3") ||
    s.includes("type 2 combo") || s.includes("combo 2") || s.includes("sae ccs")
  ) return "CCS";
  if (s.includes("chademo")) return "CHAdeMO";
  if (s.includes("type 2") || s.includes("mennekes") || s.includes("iec 62196-2") || s.includes("t2"))
    return "Type 2";
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
          const fam = detectType(c);
          if (fam) typeSet.add(fam);

          const kw = Number(c?.PowerKW ?? 0);
          if (kw > maxKW) maxKW = kw;

          const lvlTitle = (c?.Level?.Title || "").toLowerCase();
          const curTitle = (c?.CurrentType?.Title || "").toLowerCase();
          if (c?.LevelID === 3 || lvlTitle.includes("dc") || lvlTitle.includes("rapid") || curTitle.includes("dc")) {
            anyDC = true;
          }
        }

        const connectors = (conns?.length ?? site.NumberOfPoints ?? 0) || 0;
        const operational = site.StatusType?.IsOperational === true ? 1.0 : 0.6;

        // score is log-scaled connector count, softened by status
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
          types: Array.from(typeSet), // used by front-end filters
        };
      })
      .filter(Boolean);

    res.status(200).json(out);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to fetch OCM" });
  }
}

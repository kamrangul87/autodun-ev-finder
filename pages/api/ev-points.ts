// pages/api/ev-points.ts
export const runtime = "nodejs"; // force Node on Vercel (not Edge)

import type { NextApiRequest, NextApiResponse } from "next";

/* ---------------- Types ---------------- */
type OCMConn = {
  PowerKW?: number | null;
  LevelID?: number | null;
  Level?: { Title?: string | null } | null;
  CurrentType?: { Title?: string | null } | null;
  ConnectionType?: { Title?: string | null; FormalName?: string | null } | null;
  ConnectionTypeID?: number | null;
};

type OCM = {
  ID?: number;
  AddressInfo?: {
    Title?: string | null;
    AddressLine1?: string | null;
    AddressLine2?: string | null;
    Town?: string | null;
    StateOrProvince?: string | null;
    Postcode?: string | null;
    Latitude?: number;
    Longitude?: number;
  } | null;
  OperatorInfo?: { Title?: string | null } | null;
  Connections?: OCMConn[] | null;
  NumberOfPoints?: number | null;
  StatusType?: { IsOperational?: boolean } | null;
};

const CTID: Record<number, "CCS" | "CHAdeMO" | "Type 2" | "Tesla"> = {
  32: "CCS", 33: "CCS", 1030: "CCS", 1031: "CCS",
  2: "CHAdeMO",
  28: "Type 2", 30: "Type 2",
  25: "Tesla", 27: "Tesla", 1036: "Tesla",
};

/* --------------- Helpers --------------- */
function detectType(c: OCMConn): string | null {
  const id = c?.ConnectionTypeID ?? null;
  if (id && CTID[id]) return CTID[id];
  const s = [
    c?.ConnectionType?.Title,
    c?.ConnectionType?.FormalName,
    c?.Level?.Title,
    c?.CurrentType?.Title,
  ].filter(Boolean).join(" ").toLowerCase();
  if (!s) return null;
  if (s.includes("chademo")) return "CHAdeMO";
  if (s.includes("tesla") || s.includes("supercharger") || s.includes("nacs")) return "Tesla";
  if (s.includes("type 2") || s.includes("mennekes") || s.includes("iec 62196-2") || s.includes("t2")) return "Type 2";
  if (s.includes("ccs") || s.includes("combo") || s.includes("iec 62196-3") || s.includes("combo 2")) return "CCS";
  return null;
}

function mapSites(raw: unknown) {
  const data: OCM[] = Array.isArray(raw) ? raw : [];
  return data.map((site) => {
    const info = site.AddressInfo || {};
    const la = info.Latitude;
    const ln = info.Longitude;
    if (typeof la !== "number" || typeof ln !== "number") return null;

    const typeSet = new Set<string>();
    let maxKW = 0;
    let anyDC = false;

    for (const c of site.Connections ?? []) {
      const fam = detectType(c);
      if (fam) typeSet.add(fam);
      const kw = Number(c?.PowerKW ?? 0);
      if (kw > maxKW) maxKW = kw;
      const lvl = (c?.Level?.Title || "").toLowerCase();
      const cur = (c?.CurrentType?.Title || "").toLowerCase();
      if (c?.LevelID === 3 || lvl.includes("dc") || lvl.includes("rapid") || cur.includes("dc")) anyDC = true;
    }

    const connectors = (site.Connections?.length ?? site.NumberOfPoints ?? 0) || 0;
    const operational = site.StatusType?.IsOperational === true ? 1.0 : 0.6;
    const score = Math.max(0.01, Math.log1p(connectors) * operational);

    const addrParts = [info.AddressLine1, info.AddressLine2, info.Town, info.StateOrProvince].filter(Boolean);
    const addr = addrParts.join(", ");
    const postcode = info.Postcode || null;

    return {
      id: site.ID ?? null,
      name: info.Title ?? null,
      addr: addr || null,
      postcode,
      lat: la, lng: ln,
      value: score,
      breakdown: { reports: 0, downtime: 0, connectors: Math.max(0.1, connectors) },
      op: site.OperatorInfo?.Title ?? null,
      dc: anyDC,
      kw: maxKW || null,
      conn: connectors,
      types: Array.from(typeSet),
    };
  }).filter(Boolean) as any[];
}

async function timedFetch(url: string, opts: RequestInit, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally { clearTimeout(t); }
}

async function tryFetch(params: { lat: number; lon: number; distKm: number }) {
  // GB only (locked)
  const q = new URLSearchParams({
    output: "json",
    countrycode: "GB",
    latitude: String(params.lat),
    longitude: String(params.lon),
    distance: String(Math.max(10, Math.min(650, Math.round(params.distKm)))),
    distanceunit: "KM",
    maxresults: "5000",
    compact: "true",
    verbose: "false",
  });
  if (process.env.OCM_API_KEY) q.set("key", process.env.OCM_API_KEY);

  const url = `https://api.openchargemap.io/v3/poi/?${q.toString()}`;
  const headers: Record<string, string> = {
    "User-Agent": "ev-hotspots/1.2 (vercel)",
    Accept: "application/json",
    Referer: "https://openchargemap.org/",
  };
  if (process.env.OCM_API_KEY) headers["X-API-Key"] = process.env.OCM_API_KEY;

  const r = await timedFetch(url, { headers, cache: "no-store" }, 10000);
  if (r.status === 429) {
    await new Promise(res => setTimeout(res, 700));
    const r2 = await timedFetch(url, { headers, cache: "no-store" }, 10000);
    if (!r2.ok) throw new Error(`OCM ${r2.status}`);
    return mapSites(await r2.json().catch(() => []));
  }
  if (!r.ok) throw new Error(`OCM ${r.status}`);
  return mapSites(await r.json().catch(() => []));
}

/* --------- small embedded fallback so UI never empty ---------- */
const FALLBACK_GB: any[] = [
  { lat: 51.5074, lng: -0.1278, value: 1.2, name: "London (fallback)", conn: 8, kw: 150, dc: true, types: ["CCS","CHAdeMO","Type 2","Tesla"], op: "Unknown" },
  { lat: 52.4862, lng: -1.8904, value: 0.9, name: "Birmingham (fallback)", conn: 6, kw: 120, dc: true, types: ["CCS","Type 2"], op: "Unknown" },
  { lat: 53.4808, lng: -2.2426, value: 0.8, name: "Manchester (fallback)", conn: 5, kw: 50, dc: false, types: ["Type 2","Tesla"], op: "Unknown" },
  { lat: 51.4545, lng: -2.5879, value: 0.7, name: "Bristol (fallback)", conn: 4, kw: 22, dc: false, types: ["Type 2"], op: "Unknown" },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // fixed GB; ignore incoming cc
  const lat = Number(req.query.lat ?? 52.5);
  const lon = Number(req.query.lon ?? -1.5);
  const distKm = Number(req.query.distKm ?? 400);

  try {
    let out = await tryFetch({ lat, lon, distKm });
    if (out.length === 0) out = await tryFetch({ lat, lon, distKm: distKm * 1.6 });
    if (out.length === 0) out = await tryFetch({ lat, lon, distKm: 650 });
    res.setHeader("x-ev-source", "ocm");
    res.status(200).json(out);
  } catch {
    res.setHeader("x-ev-source", "fallback");
    res.status(200).json(FALLBACK_GB);
  }
}

// pages/api/ev-points.ts
export const runtime = "nodejs";

import type { NextApiRequest, NextApiResponse } from "next";

/* ---------------- types ---------------- */
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
type Point = {
  id?: number | null;
  name?: string | null;
  addr?: string | null;
  postcode?: string | null;
  lat: number; lng: number; value: number;
  breakdown?: { reports: number; downtime: number; connectors: number };
  op?: string | null; dc?: boolean; kw?: number | null;
  conn?: number | null; types?: string[];
};

/* --------------- helpers --------------- */
const CTID: Record<number, "CCS" | "CHAdeMO" | "Type 2" | "Tesla"> = {
  32: "CCS", 33: "CCS", 1030: "CCS", 1031: "CCS",
  2: "CHAdeMO",
  28: "Type 2", 30: "Type 2",
  25: "Tesla", 27: "Tesla", 1036: "Tesla",
};

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

function mapSites(raw: unknown): Point[] {
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
  }).filter(Boolean) as Point[];
}

/* -------- fallback sample (used only if no live cache yet) -------- */
const FALLBACK_GB: Point[] = [
  { lat: 51.5074, lng: -0.1278, value: 1.2, name: "London (fallback)", conn: 8, kw: 150, dc: true,  types: ["CCS","CHAdeMO","Type 2","Tesla"], op: "Unknown" },
  { lat: 52.4862, lng: -1.8904, value: 0.9, name: "Birmingham (fallback)", conn: 6, kw: 120, dc: true,  types: ["CCS","Type 2"], op: "Unknown" },
  { lat: 53.4808, lng: -2.2426, value: 0.8, name: "Manchester (fallback)", conn: 5, kw: 50,  dc: false, types: ["Type 2","Tesla"], op: "Unknown" },
  { lat: 51.4545, lng: -2.5879, value: 0.7, name: "Bristol (fallback)",    conn: 4, kw: 22,  dc: false, types: ["Type 2"], op: "Unknown" },
];

/* ---------------- in-memory cache ---------------- */
type CacheEntry = { when: number; payload: Point[]; upstreamStatus: string };
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const MAX_KEYS = 20;
const cache = new Map<string, CacheEntry>();
let lastGood: CacheEntry | null = null;

function setCache(key: string, payload: Point[], upstreamStatus: string) {
  const entry = { when: Date.now(), payload, upstreamStatus };
  cache.set(key, entry);
  lastGood = entry;
  if (cache.size > MAX_KEYS) {
    let oldestKey = ""; let oldest = Infinity;
    for (const [k, v] of cache) if (v.when < oldest) { oldest = v.when; oldestKey = k; }
    if (oldestKey) cache.delete(oldestKey);
  }
}
function getFresh(key: string): CacheEntry | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.when > CACHE_TTL_MS) return null;
  return e;
}

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

async function fetchOCM(params: { lat: number; lon: number; distKm: number }) {
  const qs = new URLSearchParams({
    output: "json",
    countrycode: "GB",                      // GB locked
    latitude: String(params.lat),
    longitude: String(params.lon),
    distance: String(Math.max(10, Math.min(650, Math.round(params.distKm)))),
    distanceunit: "KM",
    maxresults: "5000",
    compact: "true",
    verbose: "false",
  });
  if (process.env.OCM_API_KEY) qs.set("key", process.env.OCM_API_KEY);

  const url = `https://api.openchargemap.io/v3/poi/?${qs.toString()}`;
  const headers: Record<string, string> = {
    "User-Agent": "ev-hotspots/1.4 (vercel)",
    Accept: "application/json",
    Referer: "https://openchargemap.org/",
  };
  if (process.env.OCM_API_KEY) headers["X-API-Key"] = process.env.OCM_API_KEY;

  let lastStatus = "unknown";
  let delay = 600;
  for (let i = 0; i < 3; i++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(url, { headers, cache: "no-store", signal: ctrl.signal });
      lastStatus = `${r.status}`;
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) {
        await sleep(delay + Math.floor(Math.random() * 300));
        delay *= 1.8;
        continue;
      }
      if (!r.ok) throw new Error(`OCM ${r.status}`);
      const json = await r.json().catch(() => []);
      const mapped = mapSites(json);
      return { points: mapped, upstream: lastStatus };
    } finally { clearTimeout(to); }
  }
  throw new Error(`OCM failed after retries (${lastStatus})`);
}

/* ----------------- handler ----------------- */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const lat = Number(req.query.lat ?? 52.5);
  const lon = Number(req.query.lon ?? -1.5);
  const distKm = Number(req.query.distKm ?? 400);

  const key = `${lat.toFixed(3)}|${lon.toFixed(3)}|${Math.round(distKm)}`;

  const fresh = getFresh(key);
  if (fresh) {
    res.setHeader("x-ev-source", "live");
    res.setHeader("x-ev-cache", "hit");
    res.setHeader("x-ev-upstream-status", fresh.upstreamStatus);
    return res.status(200).json(fresh.payload);
  }

  try {
    const { points, upstream } = await fetchOCM({ lat, lon, distKm });

    // guard against weird tiny payloads (don’t poison cache)
    if (points.length >= 50) {
      setCache(key, points, upstream);
      res.setHeader("x-ev-source", "live");
      res.setHeader("x-ev-cache", "miss");
      res.setHeader("x-ev-upstream-status", upstream);
      return res.status(200).json(points);
    }

    // tiny payload from upstream → serve last good if possible
    if (lastGood) {
      res.setHeader("x-ev-source", "stale");
      res.setHeader("x-ev-cache", "stale");
      res.setHeader("x-ev-upstream-status", upstream);
      return res.status(200).json(lastGood.payload);
    }

    // nothing good cached yet → fallback sample
    res.setHeader("x-ev-source", "fallback");
    res.setHeader("x-ev-cache", "none");
    res.setHeader("x-ev-upstream-status", upstream);
    return res.status(200).json(FALLBACK_GB);
  } catch (e: any) {
    if (lastGood) {
      res.setHeader("x-ev-source", "stale");
      res.setHeader("x-ev-cache", "stale");
      res.setHeader("x-ev-upstream-status", "error");
      return res.status(200).json(lastGood.payload);
    }
    res.setHeader("x-ev-source", "fallback");
    res.setHeader("x-ev-cache", "none");
    res.setHeader("x-ev-upstream-status", "error");
    return res.status(200).json(FALLBACK_GB);
  }
}

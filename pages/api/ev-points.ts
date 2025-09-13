// pages/api/ev-points.ts
import type { NextApiRequest, NextApiResponse } from "next";

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
    Town?: string | null;
    StateOrProvince?: string | null;
    Postcode?: string | null;
    Latitude?: number;
    Longitude?: number;
  };
  OperatorInfo?: { Title?: string | null } | null;
  Connections?: OCMConn[] | null;
  NumberOfPoints?: number | null;
  StatusType?: { IsOperational?: boolean } | null;
};

// ---- Connector family by numeric ID (best-effort) ----
const CTID: Record<number, "CCS" | "CHAdeMO" | "Type 2" | "Tesla"> = {
  32: "CCS", 33: "CCS", 2: "CHAdeMO",
  28: "Type 2", 30: "Type 2",
  25: "Tesla", 27: "Tesla",
  1036: "Tesla", 1030: "CCS", 1031: "CCS",
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
  if (s.includes("ccs") || s.includes("combo") || s.includes("type 2 combo") || s.includes("iec 62196-3")) return "CCS";
  if (s.includes("chademo")) return "CHAdeMO";
  if (s.includes("type 2") || s.includes("mennekes") || s.includes("iec 62196-2") || s.includes("t2")) return "Type 2";
  if (s.includes("tesla") || s.includes("supercharger") || s.includes("nacs")) return "Tesla";
  return null;
}

// ---- In-memory cache (serve fast + serve-stale-on-error) ----
type CacheEntry = { ts: number; data: any };
const memCache = new Map<string, CacheEntry>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

function round(n: number, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
function cacheKey(lat: number, lon: number, distKm: number) {
  return `GB:${round(lat, 2)}:${round(lon, 2)}:${Math.round(distKm / 50)}`;
}

// ---- Fetch with timeout + simple retries ----
async function fetchWithTimeout(url: string, opts: RequestInit & { timeout?: number } = {}, attempt = 1): Promise<Response> {
  const timeout = opts.timeout ?? 8000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!r.ok) {
      // Retry 5xx up to 2 attempts
      if (r.status >= 500 && r.status < 600 && attempt < 3) {
        await new Promise(res => setTimeout(res, 300 * attempt));
        return fetchWithTimeout(url, opts, attempt + 1);
      }
    }
    return r;
  } catch (e: any) {
    if (attempt < 3) {
      await new Promise(res => setTimeout(res, 300 * attempt));
      return fetchWithTimeout(url, opts, attempt + 1);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Country locked to GB per your requirement
  const lat = Number(req.query.lat ?? 52.5);
  const lon = Number(req.query.lon ?? -1.5);
  const distKm = Number(req.query.distKm ?? 400);

  // Bucket the key so repeated searches hit cache
  const key = cacheKey(lat, lon, distKm);
  const now = Date.now();

  // Serve fresh/stale cache quickly
  const cached = memCache.get(key);
  if (cached && now - cached.ts < TTL_MS) {
    res.setHeader("Cache-Control", "s-maxage=1200, stale-while-revalidate=600");
    return res.status(200).json(cached.data);
  }

  const url =
    `https://api.openchargemap.io/v3/poi/` +
    `?output=json&countrycode=GB` +
    `&latitude=${lat}&longitude=${lon}` +
    `&distance=${distKm}&distanceunit=KM&maxresults=5000&compact=true&verbose=false`;

  const headers: Record<string, string> = {};
  if (process.env.OCM_API_KEY) headers["X-API-Key"] = process.env.OCM_API_KEY;

  try {
    const r = await fetchWithTimeout(url, { headers, cache: "no-store" as any, timeout: 8000 });
    if (!r.ok) throw new Error(`OCM ${r.status}`);
    const data: OCM[] = await r.json();

    const out = data.map(site => {
      const la = site.AddressInfo?.Latitude;
      const ln = site.AddressInfo?.Longitude;
      if (typeof la !== "number" || typeof ln !== "number") return null;

      const addr = [
        site.AddressInfo?.AddressLine1,
        site.AddressInfo?.Town,
        site.AddressInfo?.StateOrProvince,
      ].filter(Boolean).join(", ") || site.AddressInfo?.Title || null;

      const postcode = site.AddressInfo?.Postcode ?? null;

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
      const value = Math.max(0.01, Math.log1p(connectors) * operational);

      return {
        id: site.ID ?? null,
        name: site.AddressInfo?.Title ?? null,
        addr,
        postcode,
        lat: la,
        lng: ln,
        value,
        breakdown: { reports: 0, downtime: 0, connectors: Math.max(0.1, connectors) },
        op: site.OperatorInfo?.Title ?? null,
        dc: anyDC,
        kw: maxKW || null,
        conn: connectors,
        types: Array.from(typeSet),
      };
    }).filter(Boolean);

    // Populate cache and send
    const payload = out as any[];
    memCache.set(key, { ts: now, data: payload });
    res.setHeader("Cache-Control", "s-maxage=1200, stale-while-revalidate=600");
    return res.status(200).json(payload);
  } catch (e: any) {
    // Serve stale on error to avoid blanks
    const stale = memCache.get(key);
    if (stale) {
      res.setHeader("Cache-Control", "s-maxage=60");
      return res.status(200).json(stale.data);
    }
    return res.status(500).json({ error: e?.message ?? "Failed to fetch OCM" });
  }
}

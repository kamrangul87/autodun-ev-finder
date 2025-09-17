// pages/api/sites.ts
import type { NextApiRequest, NextApiResponse } from "next";

export const config = { api: { externalResolver: true } };

const OCM_BASE = "https://api.openchargemap.io/v3/poi/";
const KM_PER_DEG_LAT = 111.32;
const toRad = (d: number) => (d * Math.PI) / 180;
const kmPerDegLon = (lat: number) => KM_PER_DEG_LAT * Math.cos(toRad(lat));

function getKey(): string | undefined {
  const k = process.env.OCM_API_KEY || process.env.OPENCHARGEMAP_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

function bboxToCenterRadius(
  w: number,
  s: number,
  e: number,
  n: number
): { latC: number; lonC: number; radiusKm: number } {
  const latC = (s + n) / 2;
  const lonC = (w + e) / 2;
  const rLatKm = Math.abs(n - s) * 0.5 * KM_PER_DEG_LAT;
  const rLonKm = Math.abs(e - w) * 0.5 * kmPerDegLon(latC);
  return { latC, lonC, radiusKm: Math.max(rLatKm, rLonKm) };
}

function minRadius(input: string | undefined, floorKm: number): number {
  const n = input ? Number(input) : NaN;
  return !isFinite(n) || n <= 0 ? floorKm : Math.max(n, floorKm);
}

type Site = {
  id: number | string | null;
  lat: number | null;
  lon: number | null;
  name: string;
  addr: string;
  postcode: string | null;
  status: "up" | "down";
  connectors: number;
  maxPowerKw: number;
  source: "ocm";
};

function mapPOI(poi: any): Site {
  const ai = poi?.AddressInfo || {};
  const conns: any[] = Array.isArray(poi?.Connections) ? poi.Connections : [];
  const maxPower = conns.reduce((m: number, c: any) => {
    const p = Number(c?.PowerKW ?? 0);
    return isFinite(p) ? Math.max(m, p) : m;
  }, 0);

  return {
    id: poi?.ID ?? null,
    lat: typeof ai?.Latitude === "number" ? ai.Latitude : null,
    lon: typeof ai?.Longitude === "number" ? ai.Longitude : null,
    name: typeof ai?.Title === "string" ? ai.Title : "EV charge point",
    addr: [ai?.AddressLine1, ai?.Town, ai?.Postcode].filter(Boolean).join(", "),
    postcode: ai?.Postcode ?? null,
    status: poi?.StatusType?.IsOperational === false ? "down" : "up",
    connectors: conns.length,
    maxPowerKw: maxPower,
    source: "ocm",
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const sp = req.query as Record<string, string | undefined>;
  const bbox = sp.bbox;

  // → center + radius from bbox (fallback to central London)
  let latC: number | null = null;
  let lonC: number | null = null;
  let radiusKm = 6; // minimum km

  if (bbox) {
    const parts = String(bbox).split(",").map((x) => Number(x.trim()));
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [w, s, e, n] = parts as [number, number, number, number];
      const r = bboxToCenterRadius(w, s, e, n);
      latC = r.latC;
      lonC = r.lonC;
      radiusKm = minRadius(sp.radiusKm, Math.max(6, r.radiusKm));
    }
  }
  if (latC == null || lonC == null) {
    latC = 51.5074;  // London center
    lonC = -0.1278;
  }

  const key = getKey();
  const authed = !!key;
  const headers: HeadersInit = { "User-Agent": "Autodun/1.0" };
  if (key) (headers as any)["X-API-Key"] = key;

  async function fetchOnce(distKm: number): Promise<{ urlUsed: string; ocmStatus: number; sites: Site[] }> {
    const u = new URL(OCM_BASE);
    u.searchParams.set("output", "json");
    u.searchParams.set("compact", "true");
    u.searchParams.set("verbose", "false");
    u.searchParams.set("maxresults", "1000");
    u.searchParams.set("latitude", String(latC));
    u.searchParams.set("longitude", String(lonC));
    u.searchParams.set("distance", String(distKm));
    u.searchParams.set("distanceunit", "KM");
    if (key) u.searchParams.set("key", key);
    if (sp.conn) u.searchParams.set("connectiontypeid", sp.conn);
    if (sp.minPower) u.searchParams.set("minpowerkw", sp.minPower);

    const urlUsed = u.toString();
    const r = await fetch(urlUsed, { headers, cache: "no-store" });
    const ocmStatus = r.status;

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`OCM ${ocmStatus}: ${text.slice(0, 300)} @ ${urlUsed}`);
    }

    const data = await r.json();
    const arr = Array.isArray(data) ? data : [];
    const sites = arr.map(mapPOI).filter((s: Site) => s.lat != null && s.lon != null);
    return { urlUsed, ocmStatus, sites };
  }

  try {
    let { urlUsed, ocmStatus, sites } = await fetchOnce(radiusKm);
    if (sites.length === 0) {
      ({ urlUsed, ocmStatus, sites } = await fetchOnce(Math.max(radiusKm, 10)));
    }

    const count = sites.length;
    const body: any = {
      // primary
      sites,
      // aliases some clients expect
      stations: sites,
      out: sites,
      data: sites,
      count,
      counts: { out: count, sites: count, stations: count },
    };
    if (sp.debug === "1") {
      body.debug = { count, authed, ocmStatus, ocmUrlUsed: urlUsed };
    }

    res.setHeader("Cache-Control", "no-cache, no-store, max-age=0, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-Robots-Tag", "noindex");
    return res.status(200).json(body);
  } catch (e: any) {
    // expose precise failure to fix auth/rate limit quickly
    const message = typeof e?.message === "string" ? e.message : String(e);
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "OCM fetch failed", authed, message });
  }
}

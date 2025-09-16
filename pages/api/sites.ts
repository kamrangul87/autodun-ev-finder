import type { NextApiRequest, NextApiResponse } from "next";

export const config = { api: { externalResolver: true } };

const OCM_BASE = "https://api.openchargemap.io/v3/poi/";
const KM_PER_DEG_LAT = 111.32;
const toRad = (d: number) => (d * Math.PI) / 180;
const kmPerDegLon = (lat: number) => KM_PER_DEG_LAT * Math.cos(toRad(lat));

function getKey() {
  const k = process.env.OCM_API_KEY || process.env.OPENCHARGEMAP_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}
function bboxToCenterRadius(w: number, s: number, e: number, n: number) {
  const latC = (s + n) / 2;
  const lonC = (w + e) / 2;
  const rLat = Math.abs(n - s) * 0.5 * KM_PER_DEG_LAT;
  const rLon = Math.abs(e - w) * 0.5 * kmPerDegLon(latC);
  return { latC, lonC, radiusKm: Math.max(rLat, rLon) };
}
function minRadius(input: string | undefined, floorKm: number) {
  const n = input ? Number(input) : NaN;
  return !isFinite(n) || n <= 0 ? floorKm : Math.max(n, floorKm);
}
function mapPOI(poi: any) {
  const ai = poi?.AddressInfo || {};
  const conns = Array.isArray(poi?.Connections) ? poi.Connections : [];
  const maxPower = conns.reduce((m: number, c: any) => {
    const p = Number(c?.PowerKW ?? 0);
    return isFinite(p) ? Math.max(m, p) : m;
  }, 0);
  return {
    id: poi?.ID ?? null,
    lat: ai?.Latitude ?? null,
    lon: ai?.Longitude ?? null,
    name: ai?.Title ?? "EV charge point",
    addr: [ai?.AddressLine1, ai?.Town, ai?.Postcode].filter(Boolean).join(", "),
    postcode: ai?.Postcode ?? null,
    status: poi?.StatusType?.IsOperational === false ? "down" : "up",
    connectors: conns.length,
    maxPowerKw: maxPower,
    source: "ocm",
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const sp = req.query as Record<string, string>;
  const bbox = sp.bbox;

  // center+radius from bbox or central London
  let latC: number | null = null, lonC: number | null = null;
  let radiusKm = 6;
  if (bbox) {
    const v = String(bbox).split(",").map((x) => Number(x.trim()));
    if (v.length === 4 && v.every(Number.isFinite)) {
      const [w, s, e, n] = v as [number, number, number, number];
      const r = bboxToCenterRadius(w, s, e, n);
      latC = r.latC; lonC = r.lonC;
      radiusKm = minRadius(sp.radiusKm, Math.max(6, r.radiusKm));
    }
  }
  if (latC == null || lonC == null) { latC = 51.5074; lonC = -0.1278; }

  const key = getKey();
  const authed = !!key;
  const headers: HeadersInit = { "User-Agent": "Autodun/1.0" };
  if (key) (headers as any)["X-API-Key"] = key;

  async function fetchOnce(distKm: number) {
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
      const t = await r.text().catch(() => "");
      throw { urlUsed, ocmStatus, message: `OCM ${ocmStatus}: ${t.slice(0, 280)}` };
    }
    const data = await r.json();
    const arr = Array.isArray(data) ? data : [];
    return { urlUsed, ocmStatus, sites: arr.map(mapPOI).filter(s => s.lat != null && s.lon != null) };
  }

  try {
    // first try
    let { urlUsed, ocmStatus, sites } = await fetchOnce(radiusKm);
    if (sites.length === 0) {
      ({ urlUsed, ocmStatus, sites } = await fetchOnce(Math.max(radiusKm, 10)));
    }
    res.setHeader("Cache-Control", "no-store");
    if (sp.debug === "1") {
      return res.status(200).json({ sites, debug: { count: sites.length, authed, ocmStatus, ocmUrlUsed: urlUsed } });
    }
    return res.status(200).json({ sites });
  } catch (e: any) {
    // return the precise failure so you can fix auth/rate limits quickly
    return res.status(502).json({ error: "OCM fetch failed", authed, ...e });
  }
}

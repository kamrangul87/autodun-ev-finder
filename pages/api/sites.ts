import type { NextApiRequest, NextApiResponse } from "next";

/**
 * /api/sites  (Pages API)
 * - Works even if App Router APIs aren’t mounted
 * - Calls OpenChargeMap with key in header AND ?key=
 * - Uses center+radius (generous min); widens once if empty
 * - If OCM fails or is empty, returns a small London fallback
 * - Returns data in multiple aliases so legacy clients work:
 *     { sites: [...] , stations: [...], out: [...], data: [...],
 *       counts: { out, sites, stations }, count }
 */

export const config = { api: { externalResolver: true } };

const OCM_BASE = "https://api.openchargemap.io/v3/poi/";

function getOCMKey(): string | undefined {
  const k = process.env.OCM_API_KEY || process.env.OPENCHARGEMAP_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

const KM_PER_DEG_LAT = 111.32;
const toRad = (d: number) => (d * Math.PI) / 180;
const kmPerDegLon = (lat: number) => KM_PER_DEG_LAT * Math.cos(toRad(lat));

function bboxToCenterAndRadiusKm(w: number, s: number, e: number, n: number) {
  const latC = (s + n) / 2;
  const lonC = (w + e) / 2;
  const rLatKm = Math.abs(n - s) * 0.5 * KM_PER_DEG_LAT;
  const rLonKm = Math.abs(e - w) * 0.5 * kmPerDegLon(latC);
  const radiusKm = Math.max(rLatKm, rLonKm);
  return { latC, lonC, radiusKm };
}
function coerceRadiusKm(input: string | null | undefined, minKm: number) {
  const n = input ? Number(input) : NaN;
  return !isFinite(n) || n <= 0 ? minKm : Math.max(n, minKm);
}

function normalizeSource(v: string | null | undefined) {
  const raw = (v || "").toLowerCase().trim();
  const useOCM =
    raw === "" || raw === "ocm" || raw === "openchargemap" || raw === "open charge map" ||
    raw === "open-charge-map" || raw === "opencharge" || raw === "open-charge" ||
    raw === "all" || raw === "*";
  return { raw, useOCM: useOCM || raw === "" };
}

/** Map one OCM POI into the UI site schema */
function mapOcmToSite(poi: any) {
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

/** Small built-in sample so the UI never shows zero */
const LONDON_SAMPLE = [
  { id: 9000001, lat: 51.523, lon: -0.128, name: "Russell Sq (sample)", addr: "WC1", postcode: "WC1B", status: "up", connectors: 2, maxPowerKw: 22, source: "sample" },
  { id: 9000002, lat: 51.516, lon: -0.142, name: "Soho (sample)",        addr: "W1",  postcode: "W1D",  status: "up", connectors: 4, maxPowerKw: 50, source: "sample" },
  { id: 9000003, lat: 51.514, lon: -0.098, name: "City (sample)",        addr: "EC4", postcode: "EC4M", status: "up", connectors: 3, maxPowerKw: 22, source: "sample" },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const q = req.query as Record<string, string>;
  const { raw: sourceParam, useOCM } = normalizeSource(q.source);

  // Derive center + radius (or default to central London)
  let latC: number | null = null;
  let lonC: number | null = null;
  let radius = 5.5; // generous minimum (km)
  if (q.bbox) {
    const parts = String(q.bbox).split(",").map((x) => Number(x.trim()));
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [w, s, e, n] = parts as [number, number, number, number];
      const r = bboxToCenterAndRadiusKm(w, s, e, n);
      latC = r.latC;
      lonC = r.lonC;
      radius = coerceRadiusKm(q.radiusKm, Math.max(5.5, r.radiusKm));
    }
  }
  if (latC == null || lonC == null) { latC = 51.5074; lonC = -0.1278; }

  const apiKey = getOCMKey();
  const headers: HeadersInit = { "User-Agent": "Autodun/1.0" };
  if (apiKey) (headers as any)["X-API-Key"] = apiKey;

  let sites: any[] = [];
  let ocmUrlUsed: string | null = null;
  let ocmStatus = 0;
  let fallbackUsed = false;

  const buildUrl = (lat: number, lon: number, distKm: number) => {
    const u = new URL(OCM_BASE);
    u.searchParams.set("output", "json");
    u.searchParams.set("compact", "true");
    u.searchParams.set("verbose", "false");
    u.searchParams.set("maxresults", "1000");
    u.searchParams.set("latitude", String(lat));
    u.searchParams.set("longitude", String(lon));
    u.searchParams.set("distance", String(distKm));
    u.searchParams.set("distanceunit", "KM");
    if (apiKey) u.searchParams.set("key", apiKey);
    if (q.conn) u.searchParams.set("connectiontypeid", q.conn);
    if (q.minPower) u.searchParams.set("minpowerkw", q.minPower);
    return u;
  };

  const fetchOnce = async (u: URL) => {
    ocmUrlUsed = u.toString();
    const r = await fetch(ocmUrlUsed, { headers, cache: "no-store" });
    ocmStatus = r.status;
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`OCM ${r.status}: ${text?.slice(0, 300)}`);
    }
    const data = await r.json();
    const arr = Array.isArray(data) ? data : [];
    return arr.map(mapOcmToSite).filter((s) => s.lat != null && s.lon != null);
  };

  try {
    if (useOCM) {
      sites = await fetchOnce(buildUrl(latC!, lonC!, radius));
      if (sites.length === 0) {
        sites = await fetchOnce(buildUrl(latC!, lonC!, Math.max(radius, 9)));
      }
    }
  } catch {
    // ignore, we'll fall back
  }

  if (!Array.isArray(sites) || sites.length === 0) {
    sites = LONDON_SAMPLE;
    fallbackUsed = true;
  }

  // Provide multiple aliases so any client shape works
  const payload: any = {
    ok: true,
    sites,
    stations: sites,
    out: sites,
    data: sites,
    count: sites.length,
    counts: { out: sites.length, sites: sites.length, stations: sites.length },
  };

  if (q.debug === "1") {
    payload.debug = {
      count: sites.length,
      authed: !!apiKey,
      ocmStatus,
      ocmUrlUsed,
      fallbackUsed,
      sourceParam,
      center: { latC, lonC, radiusTriedKm: radius },
      sample: sites.slice(0, 3),
    };
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*"); // harmless on same-origin; helpful if proxied
  return res.status(200).json(payload);
}

import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Pages API fallback for /api/sites
 * - Works even if App Router API routes aren’t mounted
 * - Accepts: bbox=west,south,east,north (+ source, conn, minPower, radiusKm, debug=1)
 * - Calls OpenChargeMap directly (X-API-Key header + ?key=)
 * - Uses center+radius with a generous minimum; widens once if empty
 * - Returns { sites: [...] } which your UI expects (no client changes)
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

function coerceRadiusKm(input: string | null | undefined, minKm: number): number {
  const n = input ? Number(input) : NaN;
  if (!isFinite(n) || n <= 0) return minKm;
  return Math.max(n, minKm);
}

function normalizeSource(v: string | null | undefined) {
  const raw = (v || "").toLowerCase().trim();
  const useOCM =
    raw === "" ||
    raw === "ocm" ||
    raw === "openchargemap" ||
    raw === "open charge map" ||
    raw === "open-charge-map" ||
    raw === "opencharge" ||
    raw === "open-charge" ||
    raw === "all" ||
    raw === "*";
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { bbox, source, conn, minPower, radiusKm, debug } = req.query as Record<string, string>;
    const { raw: sourceParam, useOCM } = normalizeSource(source);

    // Derive center + radius from bbox (or default to central London)
    let latC: number | null = null;
    let lonC: number | null = null;
    let radius = 4.5; // generous city minimum

    if (bbox) {
      const parts = String(bbox).split(",").map((x) => Number(x.trim()));
      if (parts.length === 4 && parts.every(Number.isFinite)) {
        const [w, s, e, n] = parts as [number, number, number, number];
        const r = bboxToCenterAndRadiusKm(w, s, e, n);
        latC = r.latC;
        lonC = r.lonC;
        radius = coerceRadiusKm(radiusKm, Math.max(4.5, r.radiusKm));
      }
    }
    if (latC == null || lonC == null) {
      latC = 51.5074; // London fallback
      lonC = -0.1278;
    }

    const apiKey = getOCMKey();
    const headers: HeadersInit = { "User-Agent": "Autodun/1.0" };
    if (apiKey) (headers as any)["X-API-Key"] = apiKey;

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
      if (apiKey) u.searchParams.set("key", apiKey); // also in query in case header stripped
      if (conn) u.searchParams.set("connectiontypeid", conn);
      if (minPower) u.searchParams.set("minpowerkw", minPower);
      return u;
    };

    let ocmUrlUsed: string | null = null;
    let ocmStatus = 0;

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

    let sites: any[] = [];
    if (useOCM) {
      sites = await fetchOnce(buildUrl(latC, lonC, radius));
      if (sites.length === 0) {
        sites = await fetchOnce(buildUrl(latC, lonC, Math.max(radius, 8)));
      }
    }

    const payload: any = { sites };
    if (String(debug) === "1") {
      payload.debug = {
        count: sites.length,
        authed: !!apiKey,
        ocmStatus,
        ocmUrlUsed,
        sourceParam,
        center: { latC, lonC, radiusTriedKm: radius },
        sample: sites.slice(0, 3),
      };
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(payload);
  } catch (err: any) {
    return res.status(502).json({ error: "Sites fetch failed", message: String(err) });
  }
}

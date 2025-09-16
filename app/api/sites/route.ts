import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/sites
 * - Accepts bbox=west,south,east,north (+ source, conn, minPower, radiusKm)
 * - Computes center+radius (min 4.5km), retries at 8km if zero results
 * - Calls OpenChargeMap directly (header + ?key=)
 * - Returns { sites: [...] } that your UI expects
 * - Add &debug=1 to see ocmUrlUsed, status, authed, and count
 */

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

function coerceRadiusKm(input: string | null, minKm: number): number {
  const n = input ? Number(input) : NaN;
  if (!isFinite(n) || n <= 0) return minKm;
  return Math.max(n, minKm);
}

/** Map one OCM POI into our UI site schema */
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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const debug = sp.get("debug") === "1";

  // 1) Parse bbox → center + radius
  const bbox = sp.get("bbox");
  let latC: number | null = null;
  let lonC: number | null = null;
  let radiusKm = 4.5; // generous minimum

  if (bbox) {
    const parts = bbox.split(",").map((x) => Number(x.trim()));
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [w, s, e, n] = parts as [number, number, number, number];
      const r = bboxToCenterAndRadiusKm(w, s, e, n);
      latC = r.latC;
      lonC = r.lonC;
      radiusKm = coerceRadiusKm(sp.get("radiusKm"), Math.max(4.5, r.radiusKm));
    }
  }
  // Fallback to central London if bbox invalid/missing
  if (latC == null || lonC == null) {
    latC = 51.5074;
    lonC = -0.1278;
  }

  // 2) Source normalization (we currently wire OCM for "OpenChargeMap|ocm|all|*|")
  const rawSource = (sp.get("source") || "").toLowerCase().trim();
  const useOCM =
    rawSource === "" ||
    rawSource === "ocm" ||
    rawSource === "openchargemap" ||
    rawSource === "open charge map" ||
    rawSource === "open-charge-map" ||
    rawSource === "opencharge" ||
    rawSource === "open-charge" ||
    rawSource === "all" ||
    rawSource === "*";

  // 3) Filters
  const conn = sp.get("conn") || undefined;
  const minPower = sp.get("minPower") || undefined;

  // 4) Build OCM request (point+radius), send key via header + query
  const apiKey = getOCMKey();
  const headers: HeadersInit = { "User-Agent": "Autodun/1.0" };
  if (apiKey) headers["X-API-Key"] = apiKey;

  let ocmUrlUsed: string | null = null;
  let ocmStatus = 0;
  const authed = !!apiKey;

  try {
    let sites: any[] = [];

    if (useOCM) {
      const buildUrl = (lat: number, lon: number, distKm: number) => {
        const u = new URL(OCM_BASE);
        u.searchParams.set("output", "json");
        u.searchParams.set("compact", "true");
        u.searchParams.set("verbose", "false");
        u.searchParams.set("maxresults", "1000");  // bump results
        u.searchParams.set("latitude", String(lat));
        u.searchParams.set("longitude", String(lon));
        u.searchParams.set("distance", String(distKm));
        u.searchParams.set("distanceunit", "KM");
        if (apiKey) u.searchParams.set("key", apiKey); // also as query param
        if (conn) u.searchParams.set("connectiontypeid", conn);
        if (minPower) u.searchParams.set("minpowerkw", minPower);
        return u;
      };

      const fetchOnce = async (u: URL) => {
        ocmUrlUsed = u.toString();
        const res = await fetch(ocmUrlUsed, { headers, cache: "no-store" });
        ocmStatus = res.status;
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`OCM ${res.status}: ${text?.slice(0, 300)}`);
        }
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        return arr.map(mapOcmToSite).filter(s => s.lat != null && s.lon != null);
      };

      // Try at computed/min radius
      sites = await fetchOnce(buildUrl(latC, lonC, radiusKm));

      // If nothing, widen once to 8km (covers your screenshot area)
      if (sites.length === 0) {
        sites = await fetchOnce(buildUrl(latC, lonC, Math.max(radiusKm, 8)));
      }
    }

    const payload: any = { sites };
    if (debug) {
      payload.debug = {
        count: sites.length,
        authed,
        ocmStatus,
        ocmUrlUsed,
        sourceParam: rawSource,
        sample: sites.slice(0, 3),
      };
    }
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Sites fetch failed", message: String(err), authed, ocmStatus, ocmUrlUsed },
      { status: 502 }
    );
  }
}

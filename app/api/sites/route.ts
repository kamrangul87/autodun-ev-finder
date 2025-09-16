import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/sites
 * - Accepts bbox=west,south,east,north (+ optional filters: source, conn, minPower)
 * - Computes center+radius with a minimum radius for tiny viewports
 * - Calls OpenChargeMap directly (header + ?key=) and returns { sites: [...] }
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

function minRadiusKm(input?: string | null, fallback = 2.0): string {
  const n = input ? Number(input) : NaN;
  return String(!isFinite(n) || n <= 0 ? fallback : Math.max(n, fallback));
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

  // 1) Parse bbox
  const bbox = sp.get("bbox");
  let latC: number | null = null;
  let lonC: number | null = null;
  let radiusKm: string = "2.0";

  if (bbox) {
    const parts = bbox.split(",").map((x) => Number(x.trim()));
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [w, s, e, n] = parts as [number, number, number, number];
      const r = bboxToCenterAndRadiusKm(w, s, e, n);
      latC = r.latC;
      lonC = r.lonC;
      radiusKm = minRadiusKm(sp.get("radiusKm"), Math.max(2.0, r.radiusKm));
    }
  }

  // Fallback to central London if bbox missing/invalid
  if (latC == null || lonC == null) {
    latC = 51.5074;
    lonC = -0.1278;
    radiusKm = minRadiusKm(sp.get("radiusKm"), 2.5);
  }

  // 2) Source normalization (we currently only wire OCM)
  const { raw: sourceParam, useOCM } = normalizeSource(sp.get("source"));

  // 3) Filters
  const conn = sp.get("conn") || undefined;
  const minPower = sp.get("minPower") || undefined;

  // 4) Build OCM URL (point+radius) and send key via header + query param
  const apiKey = getOCMKey();
  const headers: HeadersInit = { "User-Agent": "Autodun/1.0" };
  if (apiKey) headers["X-API-Key"] = apiKey;

  let ocmUrlUsed: string | null = null;
  let ocmStatus = 0;
  let authed = !!apiKey;

  try {
    let sites: any[] = [];

    if (useOCM) {
      const u = new URL(OCM_BASE);
      u.searchParams.set("output", "json");
      u.searchParams.set("compact", "true");
      u.searchParams.set("verbose", "false");
      u.searchParams.set("maxresults", "250");
      u.searchParams.set("latitude", String(latC));
      u.searchParams.set("longitude", String(lonC));
      u.searchParams.set("distance", String(radiusKm));
      u.searchParams.set("distanceunit", "KM");
      if (apiKey) u.searchParams.set("key", apiKey); // also as query param

      if (conn) u.searchParams.set("connectiontypeid", conn);
      if (minPower) u.searchParams.set("minpowerkw", minPower);

      ocmUrlUsed = u.toString();
      const res = await fetch(ocmUrlUsed, { headers, cache: "no-store" });
      ocmStatus = res.status;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return NextResponse.json(
          { error: "OCM request failed", ocmStatus, authed, ocmUrlUsed, text: text?.slice(0, 400) },
          { status: 502 }
        );
      }
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      sites = arr.map(mapOcmToSite).filter((s) => s.lat != null && s.lon != null);

      // If 0, widen radius once (helps tiny viewports)
      if (sites.length === 0) {
        const widen = new URL(u.toString());
        widen.searchParams.set("distance", String(Math.max(Number(radiusKm) || 2, 3.5)));
        ocmUrlUsed = widen.toString();
        const r2 = await fetch(ocmUrlUsed, { headers, cache: "no-store" });
        ocmStatus = r2.status;
        if (r2.ok) {
          const d2 = await r2.json();
          const a2 = Array.isArray(d2) ? d2 : [];
          sites = a2.map(mapOcmToSite).filter((s) => s.lat != null && s.lon != null);
        }
      }

      const payload: any = { sites };
      if (debug) {
        payload.debug = {
          count: sites.length,
          useOCM,
          sourceParam,
          authed,
          ocmStatus,
          ocmUrlUsed,
          sample: sites.slice(0, 3),
        };
      }
      return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
    }

    // If not OCM (e.g., unknown source), return empty but with debug
    const payload: any = { sites: [] };
    if (debug) {
      payload.debug = { count: 0, useOCM, sourceParam, authed, ocmStatus, ocmUrlUsed };
    }
    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Sites fetch failed", message: String(err), authed, ocmStatus, ocmUrlUsed },
      { status: 502 }
    );
  }
}

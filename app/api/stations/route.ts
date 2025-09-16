import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Raw stations fetcher (OpenChargeMap).
 * - Accepts bbox (north/south/east/west) OR center+radiusKm.
 * - Normalizes source ("OpenChargeMap" | "ocm" | "all" | "*" | "") to OCM.
 * - Sends API key via X-API-Key header AND ?key= query param.
 * - Prefers center+radius; if bbox returns 0, retries as point+radius.
 * - Debug with `debug=1` returns status + URL used.
 */

const OCM_BASE = "https://api.openchargemap.io/v3/poi/";

function getOCMKey(): string | undefined {
  const k = process.env.OCM_API_KEY || process.env.OPENCHARGEMAP_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

function normalizeSource(v: string | null | undefined) {
  const raw = (v || "").toLowerCase().trim();
  const isOCM =
    raw === "" ||
    raw === "ocm" ||
    raw === "openchargemap" ||
    raw === "opencharge" ||
    raw === "open charge" ||
    raw === "open charge map" ||
    raw === "open-charge" ||
    raw === "open-charge-map" ||
    raw === "all" ||
    raw === "*";
  const isCouncil = raw === "council" || raw === "all" || raw === "*";
  const fallbackToOcm = !isOCM && !isCouncil;
  return { raw, useOCM: isOCM || fallbackToOcm, useCouncil: isCouncil };
}

function buildPointUrl(lat: string, lon: string, radiusKm: string, key?: string) {
  const u = new URL(OCM_BASE);
  u.searchParams.set("output", "json");
  u.searchParams.set("compact", "true");
  u.searchParams.set("verbose", "false");
  u.searchParams.set("maxresults", "250");
  u.searchParams.set("latitude", lat);
  u.searchParams.set("longitude", lon);
  u.searchParams.set("distance", radiusKm);
  u.searchParams.set("distanceunit", "KM");
  if (key) u.searchParams.set("key", key);
  return u;
}
function buildBBoxUrl(south: string, west: string, north: string, east: string, key?: string) {
  const u = new URL(OCM_BASE);
  u.searchParams.set("output", "json");
  u.searchParams.set("compact", "true");
  u.searchParams.set("verbose", "false");
  u.searchParams.set("maxresults", "250");
  u.searchParams.set("boundingbox", `${south},${west},${north},${east}`); // OCM order
  if (key) u.searchParams.set("key", key);
  return u;
}
function addFilters(u: URL, conn?: string, minPower?: string) {
  if (conn) u.searchParams.set("connectiontypeid", conn);
  if (minPower) u.searchParams.set("minpowerkw", minPower);
}
function minRadiusKm(input?: string | null, fallback = 1.8): string {
  const n = input ? Number(input) : NaN;
  return String(!isFinite(n) || n <= 0 ? fallback : Math.max(n, fallback));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const debug = sp.get("debug") === "1";

  const { raw: sourceParam, useOCM } = normalizeSource(sp.get("source"));

  const north = sp.get("north");
  const south = sp.get("south");
  const east  = sp.get("east");
  const west  = sp.get("west");
  const center = sp.get("center");       // "lat,lon"
  const radiusKm = sp.get("radiusKm");   // "1.8" etc.

  const conn = sp.get("conn") || undefined;
  const minPower = sp.get("minPower") || undefined;

  const apiKey = getOCMKey();
  const headers: HeadersInit = { "User-Agent": "Autodun/1.0" };
  if (apiKey) headers["X-API-Key"] = apiKey;

  let out: any[] = [];
  let ocmStatus = 0;
  let authed = !!apiKey;
  let ocmUrlUsed: string | null = null;

  const fetchJSON = async (u: URL) => {
    ocmUrlUsed = u.toString();
    const res = await fetch(ocmUrlUsed, { headers, cache: "no-store" });
    ocmStatus = res.status;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OCM HTTP ${res.status}: ${text?.slice(0, 400)}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  };

  try {
    if (useOCM) {
      if (center) {
        const [lat, lon] = center.split(",").map(s => s.trim());
        const r = minRadiusKm(radiusKm, 2.0);
        const u = buildPointUrl(lat, lon, r, apiKey);
        addFilters(u, conn, minPower);
        out = await fetchJSON(u);
      } else if (south && west && north && east) {
        // try bbox → fallback to point
        const uBBox = buildBBoxUrl(south, west, north, east, apiKey);
        addFilters(uBBox, conn, minPower);
        out = await fetchJSON(uBBox);
        if (out.length === 0) {
          const latC = (Number(south) + Number(north)) / 2;
          const lonC = (Number(west) + Number(east)) / 2;
          const uPoint = buildPointUrl(String(latC), String(lonC), minRadiusKm(radiusKm, 2.2), apiKey);
          addFilters(uPoint, conn, minPower);
          out = await fetchJSON(uPoint);
        }
      } else {
        // last resort: central London
        const u = buildPointUrl("51.5074", "-0.1278", "2.5", apiKey);
        addFilters(u, conn, minPower);
        out = await fetchJSON(u);
      }
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: "OCM fetch failed", message: String(err), ocmStatus, authed, ocmUrlUsed, where: "ocm" },
      { status: 502 }
    );
  }

  const payload: any = { out };
  if (debug) payload.debug = { sourceParam, useOCM, ocmStatus, authed, count: out.length, ocmUrlUsed };
  return NextResponse.json(payload);
}

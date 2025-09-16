import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stations API (server-only)
 * - Fetches from OpenChargeMap (OCM); council merge hook left in-place.
 * - Accepts bbox (north/south/east/west) OR center+radiusKm.
 * - Sends API key via X-API-Key header AND ?key= query param (safer on some hosts).
 * - Uses center+radius with a minimum radius; retries if a bbox yields 0.
 * - Robust `source` normalizer: "", "ocm", "openchargemap", "all", "*" -> OCM on.
 * - Debug: add `debug=1` to see status, count, and the exact OCM URL called.
 */

const OCM_BASE = "https://api.openchargemap.io/v3/poi/";

function getOCMKey(): string | undefined {
  const k = process.env.OCM_API_KEY || process.env.OPENCHARGEMAP_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

type Spatial = {
  north?: string | null;
  south?: string | null;
  east?: string | null;
  west?: string | null;
  center?: string | null;    // "lat,lon"
  radiusKm?: string | null;  // "1.25"
};

function normalizeSource(v: string | null | undefined) {
  const raw = (v || "").toLowerCase().trim();
  const isOCM =
    raw === "" ||
    raw === "ocm" ||
    raw === "openchargemap" ||
    raw === "opencharge" ||
    raw === "open charge map" ||
    raw === "open-charge-map" ||
    raw === "open charge" ||
    raw === "open-charge" ||
    raw === "all" ||
    raw === "*";
  const isCouncil = raw === "council" || raw === "all" || raw === "*";
  const fallbackToOcm = !isOCM && !isCouncil;
  return { raw, useOCM: isOCM || fallbackToOcm, useCouncil: isCouncil };
}

function buildOcmUrlPoint(lat: string, lon: string, radiusKm: string, key?: string) {
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

function buildOcmUrlBbox(south: string, west: string, north: string, east: string, key?: string) {
  const u = new URL(OCM_BASE);
  u.searchParams.set("output", "json");
  u.searchParams.set("compact", "true");
  u.searchParams.set("verbose", "false");
  u.searchParams.set("maxresults", "250");
  u.searchParams.set("boundingbox", `${south},${west},${north},${east}`); // OCM order
  if (key) u.searchParams.set("key", key);
  return u;
}

function addFilterParams(u: URL, { conn, minPower }: { conn?: string; minPower?: string }) {
  if (conn) u.searchParams.set("connectiontypeid", conn);
  if (minPower) u.searchParams.set("minpowerkw", minPower);
}

function ensureMinRadiusKm(input?: string | null, fallback = 1.5): string {
  const n = input ? Number(input) : NaN;
  if (!isFinite(n) || n <= 0) return String(fallback);
  return String(Math.max(n, fallback));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const debug = sp.get("debug") === "1";

  const { raw: sourceParam, useOCM, useCouncil } = normalizeSource(sp.get("source"));

  const spatial: Spatial = {
    north: sp.get("north"),
    south: sp.get("south"),
    east: sp.get("east"),
    west: sp.get("west"),
    center: sp.get("center"),
    radiusKm: sp.get("radiusKm"),
  };

  const conn = sp.get("conn") || undefined;
  const minPower = sp.get("minPower") || undefined;

  const apiKey = getOCMKey();
  const headers: HeadersInit = { "User-Agent": "Autodun/1.0" };
  if (apiKey) headers["X-API-Key"] = apiKey; // header (plus ?key= in URL)

  let out: any[] = [];
  let ocmStatus = 0;
  let authed = !!apiKey;
  let ocmUrlUsed: string | null = null;

  if (useOCM) {
    try {
      const fetchOnce = async (u: URL) => {
        ocmUrlUsed = u.toString();
        const res = await fetch(u.toString(), { headers, cache: "no-store" });
        ocmStatus = res.status;
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`OCM HTTP ${res.status}: ${text?.slice(0, 400)}`);
        }
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      };

      if (spatial.center) {
        const [lat, lon] = spatial.center.split(",").map((s) => s.trim());
        const radius = ensureMinRadiusKm(spatial.radiusKm, 1.8);
        const u = buildOcmUrlPoint(lat, lon, radius, apiKey);
        addFilterParams(u, { conn, minPower });
        out = await fetchOnce(u);
      } else if (spatial.south && spatial.west && spatial.north && spatial.east) {
        // Try bbox, then fallback to center+radius if zero results
        const uBBox = buildOcmUrlBbox(
          spatial.south, spatial.west, spatial.north, spatial.east, apiKey
        );
        addFilterParams(uBBox, { conn, minPower });
        out = await fetchOnce(uBBox);

        if (out.length === 0) {
          const latC = (Number(spatial.south) + Number(spatial.north)) / 2;
          const lonC = (Number(spatial.west) + Number(spatial.east)) / 2;
          const radius = ensureMinRadiusKm(spatial.radiusKm, 2.0);
          const uPoint = buildOcmUrlPoint(String(latC), String(lonC), radius, apiKey);
          addFilterParams(uPoint, { conn, minPower });
          out = await fetchOnce(uPoint);
        }
      } else {
        // Last resort: central London
        const u = buildOcmUrlPoint("51.5074", "-0.1278", "2", apiKey);
        addFilterParams(u, { conn, minPower });
        out = await fetchOnce(u);
      }
    } catch (err: any) {
      return NextResponse.json(
        { error: "OCM fetch failed", message: String(err), ocmStatus, authed, ocmUrlUsed, where: "ocm" },
        { status: 502 }
      );
    }
  }

  if (useCouncil) {
    // Merge your council data here if/when enabled.
    // out = mergeStations(out, councilData);
  }

  const payload: any = { out };
  if (debug) {
    payload.debug = {
      sourceParam,
      useOCM,
      useCouncil,
      ocmStatus,
      authed,
      count: out.length,
      ocmUrlUsed,
    };
  }
  return NextResponse.json(payload);
}

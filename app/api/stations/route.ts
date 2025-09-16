import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stations API
 * - Fetches from OpenChargeMap (OCM) and optionally council data (if you wire it).
 * - Accepts either bbox (north/south/east/west) or center+radiusKm.
 * - Always sends OCM API key via X-API-Key when present.
 * - Robust `source` handling: treats "OpenChargeMap", "ocm", "all", "*" (and unknown) as OCM.
 * - Debug mode: add `debug=1` to echo status and counts.
 */

const OCM_BASE = "https://api.openchargemap.io/v3/poi";

function getOCMKey(): string | undefined {
  const k = process.env.OCM_API_KEY || process.env.OPENCHARGEMAP_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

export async function GET(req: Request) {
  const urlIn = new URL(req.url);
  const sp = urlIn.searchParams;
  const debug = sp.get("debug") === "1";

  // ---- source selection (accept multiple aliases) ----
  const rawSource = (sp.get("source") || "").toLowerCase().trim();

  const isOpenChargeMap = (s: string) =>
    s === "" ||
    s === "ocm" ||
    s === "openchargemap" ||
    s === "opencharge" ||
    s === "open charge map" ||
    s === "open-charge-map" ||
    s === "open charge" ||
    s === "open-charge" ||
    s === "all" ||
    s === "*";

  const useOCM = isOpenChargeMap(rawSource);
  const useCouncil = rawSource === "council" || rawSource === "all" || rawSource === "*";

  // If neither recognized, default to OCM to avoid empty results
  const fallbackToOcm = !useOCM && !useCouncil;

  // ---- spatial inputs ----
  const north = sp.get("north");
  const south = sp.get("south");
  const east = sp.get("east");
  const west = sp.get("west");
  const center = sp.get("center");     // "lat,lon"
  const radiusKm = sp.get("radiusKm"); // "1.23"

  // ---- filters (pass-through) ----
  const conn = sp.get("conn") || undefined;
  const minPower = sp.get("minPower") || undefined;

  let out: any[] = [];
  let ocmStatus = 0;
  let authed = false;

  // ===================== O P E N C H A R G E M A P ===================== //
  if (useOCM || fallbackToOcm) {
    const ocmUrl = new URL(OCM_BASE);
    ocmUrl.searchParams.set("output", "json");
    ocmUrl.searchParams.set("countrycode", "GB");
    ocmUrl.searchParams.set("compact", "true");
    ocmUrl.searchParams.set("verbose", "false");
    ocmUrl.searchParams.set("maxresults", "250");

    if (center && radiusKm) {
      const [latStr, lonStr] = center.split(",").map((s) => s.trim());
      ocmUrl.searchParams.set("latitude", latStr);
      ocmUrl.searchParams.set("longitude", lonStr);
      ocmUrl.searchParams.set("distance", radiusKm);
      ocmUrl.searchParams.set("distanceunit", "KM");
    } else if (south && west && north && east) {
      // OCM expects order: south,west,north,east
      ocmUrl.searchParams.set("boundingbox", `${south},${west},${north},${east}`);
    }

    if (conn) ocmUrl.searchParams.set("connectiontypeid", conn);
    if (minPower) ocmUrl.searchParams.set("minpowerkw", minPower);

    const apiKey = getOCMKey();
    const headers: HeadersInit = { "User-Agent": "Autodun/1.0" };
    if (apiKey) {
      headers["X-API-Key"] = apiKey;
      authed = true;
    }

    try {
      const res = await fetch(ocmUrl.toString(), { headers, cache: "no-store" });
      ocmStatus = res.status;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return NextResponse.json(
          { error: "OCM request failed", ocmStatus, authed, text, where: "ocm" },
          { status: 502 }
        );
      }
      const data = await res.json();
      out = Array.isArray(data) ? data : [];
    } catch (e: any) {
      return NextResponse.json(
        { error: "OCM fetch threw", ocmStatus, authed, message: String(e), where: "ocm" },
        { status: 502 }
      );
    }
  }

  // =========================== C O U N C I L =========================== //
  if (useCouncil) {
    // If you have council ingestion, merge it here.
    // Example skeleton:
    // const council = await getCouncilStations({ north, south, east, west, center, radiusKm, ...filters });
    // out = mergeStations(out, council);
  }

  const payload: any = { out };
  if (debug) {
    payload.debug = {
      sourceParam: rawSource,
      useOCM: useOCM || fallbackToOcm,
      useCouncil,
      ocmStatus,
      authed,
      count: out.length,
    };
  }

  return NextResponse.json(payload);
}

// app/api/stations/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const OCM_BASE = "https://api.openchargemap.io/v3/poi/";

/** Read API key from env (optional for light usage) */
function getOCMKey(): string | undefined {
  const k = process.env.OCM_API_KEY || process.env.OPENCHARGEMAP_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

/** Parse bbox=west,south,east,north and convert to {lat, lon, radiusKm} */
function deriveCenterAndRadiusFromBBox(bbox: string) {
  const parts = bbox.split(",").map((v) => parseFloat(v.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return undefined;
  const [west, south, east, north] = parts;

  const centerLat = (south + north) / 2;
  const centerLon = (west + east) / 2;

  // Approx distance per degree
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos((centerLat * Math.PI) / 180);

  const dLat = north - south;
  const dLon = east - west;
  const dx = dLon * kmPerDegLon;
  const dy = dLat * kmPerDegLat;

  // Use half of diagonal as radius; clamp to sane bounds for OCM
  const halfDiagKm = Math.sqrt(dx * dx + dy * dy) / 2;
  const radiusKm = Math.max(2, Math.min(halfDiagKm, 25)); // 2–25 km

  return { lat: centerLat, lon: centerLon, radiusKm };
}

/** Safe number parsing with fallback */
function num(v: string | null | undefined, dflt: number): number {
  const n = v != null ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : dflt;
}

/** Build a small, stable normalisation + score (added under poi.autodun) */
function enrichPOI(poi: any) {
  // Lat/Lon
  const lat = poi?.AddressInfo?.Latitude ?? poi?.AddressInfo?.lat ?? null;
  const lon = poi?.AddressInfo?.Longitude ?? poi?.AddressInfo?.lng ?? null;

  // Connectors and max power
  const conns: any[] = Array.isArray(poi?.Connections) ? poi.Connections : [];
  const connectors = conns.length;
  const maxPowerKw =
    conns.reduce((m, c) => (typeof c?.PowerKW === "number" && c.PowerKW > m ? c.PowerKW : m), 0) || 0;

  // Recency
  const last =
    poi?.DateLastVerified ||
    poi?.DateLastStatusUpdate ||
    poi?.DateCreated ||
    null;

  let recencyBoost = 0.6;
  if (last) {
    const dt = new Date(last).getTime();
    const days = Number.isFinite(dt) ? (Date.now() - dt) / (1000 * 60 * 60 * 24) : 9999;
    recencyBoost = days <= 90 ? 1.0 : 0.6;
  }

  // Simple score (tune later)
  const score =
    0.6 * Math.log(1 + (connectors || 0)) +
    0.3 * (maxPowerKw / 350) +
    0.1 * recencyBoost;

  return {
    ...poi,
    autodun: {
      id: poi?.ID ?? null,
      name: poi?.AddressInfo?.Title ?? null,
      lat,
      lon,
      addr: poi?.AddressInfo?.AddressLine1 ?? null,
      postcode: poi?.AddressInfo?.Postcode ?? null,
      connectors,
      maxPowerKw,
      provider: "OCM",
      lastUpdated: last,
      score,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    // Accept either center+radius or bbox
    let lat = sp.get("lat");
    let lon = sp.get("lon");

    // support both radiusKm and dist (back-compat with your code)
    const radiusKmRaw = sp.get("radiusKm") ?? sp.get("dist");
    let radiusKm = num(radiusKmRaw, 25);

    // If bbox provided and lat/lon missing, derive center+radius
    const bbox = sp.get("bbox");
    if ((!lat || !lon) && bbox) {
      const derived = deriveCenterAndRadiusFromBBox(bbox);
      if (derived) {
        lat = String(derived.lat);
        lon = String(derived.lon);
        radiusKm = derived.radiusKm;
      }
    }

    const latN = num(lat, NaN);
    const lonN = num(lon, NaN);

    if (!Number.isFinite(latN) || !Number.isFinite(lonN)) {
      return NextResponse.json({ error: "lat/lon required" }, { status: 400 });
    }

    // Optional filters
    const conn = sp.get("conn") || undefined;          // OCM: connectiontypeid
    const minPower = sp.get("minPower") || undefined;  // OCM: minpowerkw

    // Headers
    const apiKey = getOCMKey();
    const headers: HeadersInit = {
      "User-Agent": "Autodun/1.0",
      Accept: "application/json",
    };
    if (apiKey) (headers as any)["X-API-Key"] = apiKey;

    // Build OCM URL
    const u = new URL(OCM_BASE);
    u.searchParams.set("output", "json");
    u.searchParams.set("compact", "true");
    u.searchParams.set("verbose", "false");
    u.searchParams.set("maxresults", "1000");
    u.searchParams.set("latitude", String(latN));
    u.searchParams.set("longitude", String(lonN));
    u.searchParams.set("distance", String(Math.max(2, Math.min(radiusKm, 25))));
    u.searchParams.set("distanceunit", "KM");
    if (apiKey) u.searchParams.set("key", apiKey);
    if (conn) u.searchParams.set("connectiontypeid", conn);
    if (minPower) u.searchParams.set("minpowerkw", minPower);

    // Fetch live (no cache; you can add short SWR if you want)
    const r = await fetch(u, { headers, cache: "no-store" });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return NextResponse.json(
        { error: "upstream_error", status: r.status, body: t.slice(0, 400) },
        { status: 502 }
      );
    }

    const data = await r.json();
    const arr: any[] = Array.isArray(data) ? data : [];

    // Keep the POI array shape, but add `autodun` enrichment per item
    const enriched = arr.map(enrichPOI);

    return NextResponse.json(enriched, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "stations_fetch_failed", message: String(e?.message || e) },
      { status: 502 }
    );
  }
}

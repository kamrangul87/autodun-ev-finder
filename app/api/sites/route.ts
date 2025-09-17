// app/api/sites/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OCM_BASE = "https://api.openchargemap.io/v3/poi/";
const KM_PER_DEG_LAT = 111.32;
const toRad = (d: number) => (d * Math.PI) / 180;
const kmPerDegLon = (lat: number) => KM_PER_DEG_LAT * Math.cos(toRad(lat));

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

function minRadius(input: string | null, floorKm: number): number {
  const n = input ? Number(input) : NaN;
  return !isFinite(n) || n <= 0 ? floorKm : Math.max(n, floorKm);
}

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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const bbox = url.searchParams.get("bbox");
  const conn = url.searchParams.get("conn");
  const minPower = url.searchParams.get("minPower");
  const radiusKmParam = url.searchParams.get("radiusKm");
  const debug = url.searchParams.get("debug") === "1";

  // → center + radius from bbox (fallback to central London)
  let latC: number | null = null;
  let lonC: number | null = null;
  let radiusKm = 6; // minimum km

  if (bbox) {
    const parts = bbox.split(",").map((x) => Number(x.trim()));
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [w, s, e, n] = parts as [number, number, number, number];
      const r = bboxToCenterRadius(w, s, e, n);
      latC = r.latC;
      lonC = r.lonC;
      radiusKm = minRadius(radiusKmParam, Math.max(6, r.radiusKm));
    }
  }
  if (latC == null || lonC == null) {
    latC = 51.5074; // London center
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
    if (conn) u.searchParams.set("connectiontypeid", conn);
    if (minPower) u.searchParams.set("minpowerkw", minPower);

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
      sites,
      // aliases to satisfy any legacy consumers
      stations: sites,
      out: sites,
      data: sites,
      count,
      counts: { out: count, sites: count, stations: count },
      ...(debug ? { debug: { count, authed, ocmStatus, ocmUrlUsed: urlUsed } } : {}),
    };

    return NextResponse.json(body, {
      status: 200,
      headers: {
        "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e: any) {
    const message = typeof e?.message === "string" ? e.message : String(e);
    return NextResponse.json(
      { error: "OCM fetch failed", authed, message },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}

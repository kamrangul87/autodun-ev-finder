import { NextRequest, NextResponse } from "next/server";
import { GET as stationsGET } from "../stations/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/** Map a single OpenChargeMap record to the UI site schema */
function mapOcmToSite(poi: any) {
  const id = poi?.ID ?? poi?.id ?? null;
  const ai = poi?.AddressInfo || {};
  const lat = ai?.Latitude ?? null;
  const lon = ai?.Longitude ?? null;
  const name = ai?.Title ?? "EV charge point";
  const addr = [ai?.AddressLine1, ai?.Town, ai?.Postcode].filter(Boolean).join(", ");

  // connectors & power
  const conns = Array.isArray(poi?.Connections) ? poi.Connections : [];
  const connectors = conns.length;
  const maxPower = conns.reduce((m: number, c: any) => {
    const p = Number(c?.PowerKW ?? 0);
    return isFinite(p) ? Math.max(m, p) : m;
  }, 0);

  const status = poi?.StatusType?.IsOperational === false ? "down" : "up";

  return {
    id,
    lat,
    lon,
    name,
    addr,
    postcode: ai?.Postcode ?? null,
    status,
    connectors,
    maxPowerKw: maxPower,
    source: "ocm",
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const debug = sp.get("debug") === "1";

  // Forward all params except bbox; we’ll add derived center+radius
  const fwd = new URL(req.url);
  const passthrough = new URLSearchParams();
  for (const [k, v] of sp.entries()) {
    if (k !== "bbox") passthrough.set(k, v);
  }

  const bbox = sp.get("bbox");
  if (bbox) {
    const parts = bbox.split(",").map((x) => Number(x.trim()));
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [w, s, e, n] = parts as [number, number, number, number];

      // keep bbox as-is for downstream
      passthrough.set("west", String(w));
      passthrough.set("south", String(s));
      passthrough.set("east", String(e));
      passthrough.set("north", String(n));

      // also derive center+radius and enforce a minimum
      const { latC, lonC, radiusKm } = bboxToCenterAndRadiusKm(w, s, e, n);
      const MIN_RADIUS_KM = 2.0;
      const effRadiusKm = Math.max(radiusKm, MIN_RADIUS_KM);
      passthrough.set("center", `${latC},${lonC}`);
      passthrough.set("radiusKm", effRadiusKm.toFixed(2));
    }
  }

  fwd.search = passthrough.toString();
  const forwardedReq = new Request(fwd.toString(), { method: "GET", headers: req.headers });

  // Call the raw stations endpoint
  const resp = await stationsGET(forwardedReq as any);
  const raw = await (resp as Response).json();

  const ocmList: any[] = Array.isArray(raw?.out) ? raw.out : [];
  const sites = ocmList.map(mapOcmToSite).filter(s => s.lat != null && s.lon != null);

  // By default return exactly what the client expects
  const payload: any = { sites };

  // When debugging, include counters + upstream debug
  if (debug) {
    payload.debug = {
      count: sites.length,
      upstream: raw?.debug ?? null,
      sample: sites.slice(0, 3),
    };
  }

  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}

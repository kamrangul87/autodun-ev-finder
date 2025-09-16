import { NextRequest, NextResponse } from "next/server";
import { GET as stationsGET } from "../stations/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KM_PER_DEG_LAT = 111.32;
const toRad = (d: number) => (d * Math.PI) / 180;
function kmPerDegLon(lat: number) {
  return KM_PER_DEG_LAT * Math.cos(toRad(lat));
}
function bboxToCenterAndRadiusKm(w: number, s: number, e: number, n: number) {
  const latC = (s + n) / 2;
  const lonC = (w + e) / 2;
  const rLatKm = Math.abs(n - s) * 0.5 * KM_PER_DEG_LAT;
  const rLonKm = Math.abs(e - w) * 0.5 * kmPerDegLon(latC);
  const radiusKm = Math.max(rLatKm, rLonKm);
  return { latC, lonC, radiusKm };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sp = url.searchParams;

  // forward all params except bbox; we expand bbox → center+radius
  const passthrough = new URLSearchParams();
  for (const [k, v] of sp.entries()) if (k !== "bbox") passthrough.set(k, v);

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

      // derive center+radius and enforce a minimum
      const { latC, lonC, radiusKm } = bboxToCenterAndRadiusKm(w, s, e, n);
      const MIN_RADIUS_KM = 1.2;
      const effRadiusKm = Math.max(radiusKm, MIN_RADIUS_KM);
      passthrough.set("center", `${latC},${lonC}`);
      passthrough.set("radiusKm", effRadiusKm.toFixed(2));
    }
  }

  // call stations with expanded params
  const fwd = new URL(req.url);
  fwd.search = passthrough.toString();
  const forwardedReq = new Request(fwd.toString(), { method: "GET", headers: req.headers });
  const resp = await stationsGET(forwardedReq as any);

  // augment when debug=1
  if (sp.get("debug") === "1") {
    const data = await (resp as Response).json();
    const out = data?.out ?? [];
    const ocmStatus = data?.debug?.ocmStatus ?? null;
    const authed = data?.debug?.authed ?? null;
    return NextResponse.json({
      ...data,
      counts: { out: Array.isArray(out) ? out.length : 0 },
      ocmStatus,
      authed,
    });
  }
  return resp as NextResponse;
}

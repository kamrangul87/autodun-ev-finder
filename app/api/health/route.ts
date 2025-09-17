// app/api/health/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OCM_BASE = "https://api.openchargemap.io/v3/poi/";

function getKey() {
  const k = process.env.OCM_API_KEY || process.env.OPENCHARGEMAP_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const LIVE = (process.env.LIVE_DATA || "on").toLowerCase() !== "off";
  const council = process.env.COUNCIL_URL || null;
  const key = getKey();

  const ping = url.searchParams.get("ping") === "1";
  const lat = Number(url.searchParams.get("lat") ?? 51.5074);
  const lon = Number(url.searchParams.get("lon") ?? -0.1278);

  let ocm: any = { skipped: !ping };

  if (ping) {
    const u = new URL(OCM_BASE);
    u.searchParams.set("output", "json");
    u.searchParams.set("compact", "true");
    u.searchParams.set("verbose", "false");
    u.searchParams.set("maxresults", "1");
    u.searchParams.set("latitude", String(lat));
    u.searchParams.set("longitude", String(lon));
    u.searchParams.set("distance", "6");
    u.searchParams.set("distanceunit", "KM");
    if (key) u.searchParams.set("key", key);

    const headers: HeadersInit = { "User-Agent": "Autodun/1.0" };
    if (key) (headers as any)["X-API-Key"] = key;

    try {
      const r = await fetch(u.toString(), { headers, cache: "no-store" });
      const data = r.ok ? await r.json() : null;
      ocm = {
        url: u.toString(),
        authed: !!key,
        status: r.status,
        count: Array.isArray(data) ? data.length : 0,
      };
    } catch (e: any) {
      ocm = { url: u.toString(), authed: !!key, error: String(e) };
    }
  }

  return NextResponse.json(
    {
      ok: true,
      env: {
        LIVE_DATA: LIVE ? "on" : "off",
        OCM_KEY_PRESENT: !!key,
        COUNCIL_URL_SET: !!council,
      },
      ocm,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

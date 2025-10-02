import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat") ?? "51.5072";
  const lng = searchParams.get("lng") ?? "-0.1276";
  const distance = searchParams.get("distance") ?? "25";
  const maxresults = searchParams.get("maxresults") ?? "650";
  const countrycode = searchParams.get("countrycode") ?? "GB";

  const OCM_URL =
    `https://api.openchargemap.io/v3/poi/` +
    `?output=json&latitude=${lat}&longitude=${lng}` +
    `&distance=${distance}&distanceunit=KM` +
    `&maxresults=${maxresults}&countrycode=${countrycode}`;

  try {
    const res = await fetch(OCM_URL, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.OCM_API_KEY ?? "", // optional key if you have one
        "User-Agent": "autodun-ev-finder",
      },
      // never cache this in Vercel/CDN so you always get fresh results
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: `OCM ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    // Fallback so the UI still shows *something* when OCM is down
    try {
      const fallback = await fetch(`${new URL(req.url).origin}/data/ev_heat.json`, { cache: "no-store" });
      const json = await fallback.json();
      return NextResponse.json(json, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({ error: e?.message ?? "Fetch failed" }, { status: 500 });
    }
  }
}

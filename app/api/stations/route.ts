import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const dist = searchParams.get("dist") || "10";
  const minPower = searchParams.get("minPower") || "0";
  const conn = searchParams.get("conn"); // optional connector filter keyword

  if (!lat || !lon) return new Response(JSON.stringify({ error: "Missing lat/lon" }), { status: 400 });

  // OpenChargeMap API docs: https://openchargemap.org/site/develop/api
  const url = `https://api.openchargemap.io/v3/poi?output=json&maxresults=100&compact=true&verbose=false&latitude=${lat}&longitude=${lon}&distance=${dist}&distanceunit=KM`;
  const res = await fetch(url, {
    headers: {
      "X-API-Key": process.env.OCM_API_KEY || "",
      "User-Agent": "Autodun-EV-Finder/1.0"
    }
  });
  const arr = await res.json();

  // Filter by connector keyword and min power if provided
  const filtered = (arr || []).filter((p: any) => {
    const connections = p.Connections || [];
    const hasConn = conn ? connections.some((c: any) => (c.ConnectionType && (c.ConnectionType.FormalName || c.ConnectionType.Title || "")).toLowerCase().includes(conn.toLowerCase())) : true;
    const hasPower = Number(minPower) > 0 ? connections.some((c: any) => (c.PowerKW || 0) >= Number(minPower)) : true;
    return hasConn && hasPower;
  });

  return new Response(JSON.stringify(filtered), { status: 200, headers: { "content-type": "application/json" } });
}

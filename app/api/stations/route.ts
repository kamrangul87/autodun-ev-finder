// app/api/stations/route.ts
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const dist = Number(searchParams.get("dist") ?? 10);
  const minPower = Number(searchParams.get("minPower") ?? 0);
  const connQuery = (searchParams.get("conn") ?? "").toLowerCase().trim();

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return new Response(JSON.stringify({ error: "missing lat/lon" }), { status: 400 });
  }

  // Ask OpenChargeMap for a bounded set
  const ocmParams = new URLSearchParams({
    output: "json",
    countrycode: "GB",
    latitude: String(lat),
    longitude: String(lon),
    distance: String(Math.min(dist, 60)), // safety clamp
    distanceunit: "KM",
    maxresults: "250",                    // <-- important: don't fetch thousands
    compact: "true",
    verbose: "false",
  });

  if (process.env.OCM_API_KEY) {
    ocmParams.set("key", process.env.OCM_API_KEY);
  }

  const r = await fetch(`https://api.openchargemap.io/v3/poi/?${ocmParams.toString()}`, {
    headers: process.env.OCM_API_KEY
      ? { "X-API-Key": process.env.OCM_API_KEY }
      : undefined,
    next: { revalidate: 60 },
  });

  const raw = await r.json();

  // Filter by power + connector (fuzzy matching)
  let stations = (Array.isArray(raw) ? raw : []).filter((s: any) => {
    const okPower = (s?.Connections ?? []).some((c: any) => (c?.PowerKW ?? 0) >= minPower);
    if (!okPower) return false;
    if (!connQuery) return true;

    const cStr = (s?.Connections ?? [])
      .map((c: any) =>
        `${c?.ConnectionType?.Title ?? ""} ${c?.ConnectionType?.FormalName ?? ""}`.toLowerCase()
      )
      .join(" ");

    return (
      cStr.includes(connQuery) ||
      (connQuery.includes("type 2") &&
        (cStr.includes("type 2") || cStr.includes("type-2") || cStr.includes("mennekes"))) ||
      (connQuery.includes("ccs") && cStr.includes("ccs")) ||
      (connQuery.includes("chademo") && cStr.includes("chademo"))
    );
  })
  .map((s: any) => ({
    ID: s.ID,
    AddressInfo: {
      Title: s.AddressInfo?.Title,
      AddressLine1: s.AddressInfo?.AddressLine1,
      Town: s.AddressInfo?.Town,
      Postcode: s.AddressInfo?.Postcode,
      RelatedURL: s.AddressInfo?.RelatedURL,
      ContactTelephone1: s.AddressInfo?.ContactTelephone1,
      Latitude: s.AddressInfo?.Latitude,
      Longitude: s.AddressInfo?.Longitude,
    },
    Connections: (s.Connections ?? []).map((c: any) => ({
      ConnectionType: {
        Title: c.ConnectionType?.Title,
        FormalName: c.ConnectionType?.FormalName,
      },
      PowerKW: c.PowerKW,
      Amps: c.Amps,
    })),
  }));

  // Hard cap to keep the client safe
  const MAX_TO_SEND = 400;
  stations = stations.slice(0, MAX_TO_SEND);

  return new Response(JSON.stringify(stations), {
    headers: { "content-type": "application/json" },
  });
}



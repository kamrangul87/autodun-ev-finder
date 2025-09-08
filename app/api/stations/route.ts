// app/api/stations/route.ts
import type { NextRequest } from "next/server";

function normalize(s: unknown): string {
  return String(s ?? "").toLowerCase();
}

// very tolerant connector matcher
function matchesConnector(connections: any[], q: string): boolean {
  const want = normalize(q);
  if (!want) return true; // "Any"

  // Build a single searchable string from all connection fields we care about
  const hay = normalize(
    connections
      .map((c) => [
        c?.ConnectionType?.Title,
        c?.ConnectionType?.FormalName,
        c?.Comments,
        c?.CurrentType?.Title,      // present on some records
        c?.CurrentType?.Description // present on some records
      ].filter(Boolean).join(" "))
      .join(" ")
  );

  // Groups of synonyms used in OCM data
  const isCHAdeMO = /chademo/.test(hay);

  // CCS often appears as CCS, Combo, Combo 2, IEC 62196-3 etc.
  const isCCS = /(ccs|combo|iec\s*62196-3)/.test(hay);

  // Type 2 appears as Type 2, Type-2, Mennekes, IEC 62196 Type 2, etc.
  const isType2 = /(type[\s-]?2|mennekes|iec\s*62196[^0-9]*2)/.test(hay);

  if (/(^|[^a-z])chademo([^a-z]|$)/.test(want)) return isCHAdeMO;
  if (/ccs/.test(want)) return isCCS;
  if (/type\s*2/.test(want)) return isType2;

  // fallback: substring include
  return hay.includes(want);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const dist = Number(searchParams.get("dist") ?? 10);
  const minPower = Number(searchParams.get("minPower") ?? 0);
  const connQuery = normalize(searchParams.get("conn") ?? "");

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return new Response(JSON.stringify({ error: "missing lat/lon" }), { status: 400 });
  }

  const ocm = new URLSearchParams({
    output: "json",
    countrycode: "GB",
    latitude: String(lat),
    longitude: String(lon),
    distance: String(Math.min(dist, 60)), // clamp distance
    distanceunit: "KM",
    maxresults: "250",
    compact: "true",
    verbose: "false",
  });

  if (process.env.OCM_API_KEY) {
    ocm.set("key", process.env.OCM_API_KEY);
  }

  const res = await fetch(`https://api.openchargemap.io/v3/poi/?${ocm.toString()}`, {
    headers: process.env.OCM_API_KEY ? { "X-API-Key": process.env.OCM_API_KEY } : undefined,
    next: { revalidate: 60 },
  });

  const raw = await res.json();
  let stations = (Array.isArray(raw) ? raw : [])
    .filter((s: any) => {
      const conns = s?.Connections ?? [];

      // power filter (accepts missing PowerKW when minPower=0)
      const okPower =
        minPower <= 0
          ? conns.length > 0
          : conns.some((c: any) => (Number(c?.PowerKW) || 0) >= minPower);

      if (!okPower) return false;

      // connector filter (tolerant)
      return matchesConnector(conns, connQuery);
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

  // cap the payload for safety
  stations = stations.slice(0, 400);

  return new Response(JSON.stringify(stations), {
    headers: { "content-type": "application/json" },
  });
}

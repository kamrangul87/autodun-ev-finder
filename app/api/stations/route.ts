// app/api/stations/route.ts
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const dist = Number(searchParams.get("dist") ?? 10);
  const minPower = Number(searchParams.get("minPower") ?? 0);
  const connQuery = (searchParams.get("conn") ?? "").trim().toLowerCase(); // "" means Any

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response(JSON.stringify({ error: "Missing lat/lon" }), { status: 400 });
  }

  // Call OpenChargeMap
  const url = new URL("https://api.openchargemap.io/v3/poi/");
  url.searchParams.set("output", "json");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("distance", String(Math.min(Math.max(dist, 1), 200)));
  url.searchParams.set("distanceunit", "KM");
  url.searchParams.set("compact", "true");
  url.searchParams.set("verbose", "false");
  url.searchParams.set("maxresults", "150");

  // API key (env name can be whatever you used in Vercel)
  const apiKey = process.env.OCM_API_KEY ?? process.env.NEXT_PUBLIC_OCM_KEY ?? "";
  if (apiKey) url.searchParams.set("key", apiKey);

  const r = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!r.ok) {
    return new Response(JSON.stringify({ error: "OCM request failed" }), { status: 502 });
  }

  let stations: any[] = await r.json();

  // ---- Filters ----

  // Min power (kW)
  if (minPower > 0) {
    stations = stations.filter((s) =>
      (s.Connections ?? []).some((c: any) => (c.PowerKW ?? 0) >= minPower)
    );
  }

  // Fuzzy connector filter (CCS / Type 2 / CHAdeMO etc.)
  if (connQuery) {
    stations = stations.filter((s) =>
      (s.Connections ?? []).some((c: any) => {
        const t = `${c.ConnectionType?.Title ?? ""} ${c.ConnectionType?.FormalName ?? ""}`
          .toLowerCase();

        if (t.includes(connQuery)) return true;              // generic contains

        // Synonyms / variants
        if (connQuery === "ccs") return /ccs|combo/.test(t); // CCS (Combo) etc.
        if (connQuery.replace(/\s+/g, "") === "type2") return /type ?2|mennekes/.test(t);
        if (connQuery === "chademo") return /chademo/.test(t);

        return false;
      })
    );
  }

  // Trim the payload to what the UI needs
  const out = stations.map((s) => ({
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
      Voltage: c.Voltage,
    })),
  }));

  return new Response(JSON.stringify(out), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}


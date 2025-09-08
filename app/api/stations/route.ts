// app/api/stations/route.ts
import { NextRequest } from "next/server";

type Any = any;

function normalizeConnName(name: string) {
  const n = (name || "").toLowerCase();

  // CCS
  if (/\bccs\b|combo|combined/.test(n)) return "ccs";

  // CHAdeMO (allow misspellings)
  if (/cha?de?mo/.test(n)) return "chademo";

  // Type 2 (Mennekes / IEC 62196-2 Type 2)
  if (/type\s*2|mennekes|62196-2/.test(n)) return "type2";

  // Type 1 (J1772)
  if (/type\s*1|j1772|62196-1/.test(n)) return "type1";

  return n;
}

function matchesConnector(reqConn: string, connTitle: string) {
  if (!reqConn) return true;
  const want = normalizeConnName(reqConn);
  const have = normalizeConnName(connTitle);
  return want === have;
}

function meetsPower(minPower: number, connTitle: string, powerKW: number | null | undefined) {
  const p = typeof powerKW === "number" ? powerKW : NaN;

  if (!minPower || minPower <= 0) return true;

  // If power is present, compare numerically.
  if (!Number.isNaN(p) && p > 0) return p >= minPower;

  // Many Type 2 points don’t specify PowerKW.
  // Be permissive for normal AC if the user’s minPower is small (≤ 7 kW).
  if (minPower <= 7 && normalizeConnName(connTitle) === "type2") return true;

  return false;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const lat = parseFloat(url.searchParams.get("lat") || "");
    const lon = parseFloat(url.searchParams.get("lon") || "");
    const dist = Math.min(60, Math.max(1, parseFloat(url.searchParams.get("dist") || "10"))); // clamp 1–60 km
    const minPower = parseFloat(url.searchParams.get("minPower") || "0");
    const connQuery = (url.searchParams.get("conn") || "").trim();

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return new Response(JSON.stringify({ error: "Missing lat/lon" }), { status: 400 });
    }

    // Fetch from OpenChargeMap
    const ocmURL =
      `https://api.openchargemap.io/v3/poi/?output=json` +
      `&latitude=${lat}&longitude=${lon}` +
      `&distance=${dist}&distanceunit=KM` +
      `&maxresults=300&compact=true&verbose=false` +
      `&key=${process.env.OCM_KEY ?? ""}`;

    const res = await fetch(ocmURL, {
      headers: {
        "User-Agent": "Autodun-EV-Finder/1.0 (contact: info@autodun.com)",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Upstream error", status: res.status }), { status: 502 });
    }

    const raw: Any[] = await res.json();

    // Filter + trim
    const filtered = raw.filter((s) => {
      const conns: Any[] = s.Connections ?? [];
      if (!conns.length) return false;

      return conns.some((c) => {
        const title = c.ConnectionType?.Title || "";
        return matchesConnector(connQuery, title) && meetsPower(minPower, title, c.PowerKW);
      });
    });

    const out = filtered.map((s) => ({
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
      Connections: (s.Connections ?? []).map((c: Any) => ({
        ConnectionType: {
          Title: c.ConnectionType?.Title,
          FormalName: c.ConnectionType?.FormalName,
        },
        PowerKW: c.PowerKW ?? null,
        Amps: c.Amps ?? null,
        Voltage: c.Voltage ?? null,
      })),
    }));

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500 });
  }
}

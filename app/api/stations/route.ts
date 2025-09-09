// app/api/stations/route.ts
import { NextRequest } from "next/server";
import {
  type OCMStation,
  featuresFor,
  scoreFor,
  distanceKm,
  matchesConn,
  hasAtLeastPower,
} from "@/lib/model1";

type TrimmedStation = {
  ID: number;
  _score: number;
  _distanceKm: number;
  AddressInfo?: {
    Title?: string | null;
    AddressLine1?: string | null;
    Town?: string | null;
    Postcode?: string | null;
    Latitude?: number | null;
    Longitude?: number | null;
    ContactTelephone1?: string | null;
    RelatedURL?: string | null;
  } | null;
  Connections?: Array<{
    PowerKW?: number | null;
    ConnectionType?: { Title?: string | null; FormalName?: string | null } | null;
  }> | null;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const lat = Number(searchParams.get("lat"));
    const lon = Number(searchParams.get("lon"));
    const dist = Math.max(1, Number(searchParams.get("dist") || 10)); // km
    const minPower = Number(searchParams.get("minPower") || 0);
    const conn = (searchParams.get("conn") || "").trim();

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return Response.json({ error: "Missing or invalid lat/lon" }, { status: 400 });
    }

    // Fetch from OpenChargeMap (GB-focused, adjust country if you expand later)
    // Add X-API-Key if you have one in env; otherwise OCM still works with lower rate limits.
    const headers: Record<string, string> = {};
    if (process.env.OCM_API_KEY) headers["X-API-Key"] = process.env.OCM_API_KEY;

    const url =
      `https://api.openchargemap.io/v3/poi/?output=json&countrycode=GB` +
      `&latitude=${lat}&longitude=${lon}&distance=${dist}&distanceunit=KM` +
      `&compact=true&verbose=false&maxresults=200`;

    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      return Response.json({ error: `OCM ${res.status}` }, { status: 502 });
    }

    const raw: OCMStation[] = await res.json();

    // Filter and score
    const filtered = (raw || [])
      .filter((s) => !!s?.AddressInfo?.Latitude && !!s?.AddressInfo?.Longitude)
      .map((s) => {
        const f = featuresFor(s);
        const sc = scoreFor(f);
        const d = distanceKm(
          lat,
          lon,
          Number(s.AddressInfo?.Latitude) || 0,
          Number(s.AddressInfo?.Longitude) || 0
        );
        return { station: s, _score: sc, _distanceKm: d };
      })
      // distance & filters
      .filter(({ station, _distanceKm }) => {
        if (_distanceKm > dist + 0.5) return false; // guard if API over-includes
        if (!matchesConn(station, conn)) return false;
        if (!hasAtLeastPower(station, minPower)) return false;
        return true;
      })
      // sort: closest first, then score desc
      .sort((a, b) => a._distanceKm - b._distanceKm || b._score - a._score);

    // Trim payload we send to the client
    const payload: TrimmedStation[] = filtered.map(({ station, _score, _distanceKm }) => ({
      ID: station.ID,
      _score: Number(_score.toFixed(3)),
      _distanceKm: Math.round(_distanceKm * 10) / 10,
      AddressInfo: {
        Title: station.AddressInfo?.Title ?? null,
        AddressLine1: station.AddressInfo?.AddressLine1 ?? null,
        Town: station.AddressInfo?.Town ?? null,
        Postcode: station.AddressInfo?.Postcode ?? null,
        Latitude: station.AddressInfo?.Latitude ?? null,
        Longitude: station.AddressInfo?.Longitude ?? null,
        ContactTelephone1: station.AddressInfo?.ContactTelephone1 ?? null,
        RelatedURL: station.AddressInfo?.RelatedURL ?? null,
      },
      Connections: (station.Connections ?? [])?.map((c) => ({
        PowerKW: c?.PowerKW ?? null,
        ConnectionType: c?.ConnectionType
          ? {
              Title: c.ConnectionType?.Title ?? null,
              FormalName: c.ConnectionType?.FormalName ?? null,
            }
          : null,
      })),
    }));

    return Response.json(payload, { status: 200 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

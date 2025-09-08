// app/api/stations/route.ts
import { NextRequest } from "next/server";

type OCConnection = {
  ConnectionType?: { Title?: string; FormalName?: string };
  PowerKW?: number | null;
  Amps?: number | null;
  Voltage?: number | null;
};

type OCStation = {
  ID: number;
  AddressInfo?: {
    Title?: string;
    AddressLine1?: string;
    Town?: string;
    Postcode?: string;
    RelatedURL?: string;
    ContactTelephone1?: string;
    Latitude?: number;
    Longitude?: number;
  };
  Connections?: OCConnection[] | null;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const dist = clamp(Number(searchParams.get("dist") || 10), 1, 100);
  const minPower = Math.max(0, Number(searchParams.get("minPower") || 0));
  const connQueryRaw = (searchParams.get("conn") || "").trim();
  const connQuery = connQueryRaw.toLowerCase();
  const debug = searchParams.get("debug") === "1";

  // If coords are missing, never blow up the UI
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return json([], 200);
  }

  const key =
    process.env.OPENCHARGEMAP_API_KEY ||
    process.env.NEXT_PUBLIC_OPENCHARGEMAP_API_KEY ||
    "";

  const url = new URL("https://api.openchargemap.io/v3/poi/");
  url.searchParams.set("output", "json");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("distance", String(dist));
  url.searchParams.set("distanceunit", "km");
  url.searchParams.set("maxresults", "200");
  url.searchParams.set("compact", "true");
  url.searchParams.set("verbose", "false");
  if (key) url.searchParams.set("key", key);

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Autodun-EV-Finder/1.0 (contact: info@autodun.com)" },
    cache: "no-store",
  });

  const raw: unknown = await res.json().catch(() => []);
  const list: OCStation[] = Array.isArray(raw) ? (raw as OCStation[]) : [];

  // ---------- filtering helpers ----------
  const norm = (s: unknown): string =>
    String(s || "")
      .toLowerCase()
      .replace(/[\s\-_/().]+/g, ""); // remove separators

  // synonyms to catch common variations coming from OCM
  const isType2 = (t: string): boolean =>
    t.includes("type2") || t.includes("mennekes") || t.includes("iec621962");

  const isCCS = (t: string): boolean =>
    t.includes("ccs") || t.includes("combo") || t.includes("combinedchargingsystem") || t.includes("iec621963");

  const isCHAdeMO = (t: string): boolean => t.includes("chademo");

  const matchesConnector = (s: OCStation): boolean => {
    if (!connQuery) return true; // “Any”
    const conns = Array.isArray(s.Connections) ? (s.Connections as OCConnection[]) : [];
    const labels: string[] = conns.map((c) =>
      norm(c?.ConnectionType?.FormalName || c?.ConnectionType?.Title)
    );

    if (connQuery === "type 2" || connQuery === "type2") {
      return labels.some((t: string) => isType2(t));
    }
    if (connQuery === "ccs") {
      return labels.some((t: string) => isCCS(t));
    }
    if (connQuery === "chademo") {
      return labels.some((t: string) => isCHAdeMO(t));
    }
    // fallback substring match on the normalized query
    const qn = norm(connQuery);
    return labels.some((t: string) => t.includes(qn));
  };

  const matchesPower = (s: OCStation): boolean => {
    if (!minPower) return true;
    const conns = Array.isArray(s.Connections) ? (s.Connections as OCConnection[]) : [];
    return conns.some((c) => (Number(c?.PowerKW) || 0) >= minPower);
  };

  const keep = (s: OCStation) => matchesConnector(s) && matchesPower(s);

  // ---------- trim payload ----------
  const kept = list.filter(keep);
  const trimmed = kept.map((s) => ({
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
    Connections: (Array.isArray(s.Connections) ? s.Connections : []).map((c) => ({
      ConnectionType: {
        Title: c?.ConnectionType?.Title,
        FormalName: c?.ConnectionType?.FormalName,
      },
      PowerKW: c?.PowerKW,
      Amps: c?.Amps,
      Voltage: c?.Voltage,
    })),
  }));

  if (debug) {
    // helpful debug payload you can open in the browser
    const sampleLabels = list
      .flatMap((s) =>
        (Array.isArray(s.Connections) ? s.Connections : []).map(
          (c) => c?.ConnectionType?.FormalName || c?.ConnectionType?.Title || "?"
        )
      )
      .slice(0, 80);
    return json(
      {
        query: { lat, lon, dist, minPower, conn: connQueryRaw },
        counts: { raw: list.length, kept: trimmed.length },
        sampleLabels,
        note: "This debug payload is only returned when ?debug=1 is used.",
      },
      200
    );
  }

  return json(trimmed, 200);
}

// utils
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

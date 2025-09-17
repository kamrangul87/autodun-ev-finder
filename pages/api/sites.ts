import type { NextApiRequest, NextApiResponse } from "next";
import fs from "node:fs/promises";
import path from "node:path";

export const config = { api: { externalResolver: true } };

const OCM_BASE = "https://api.openchargemap.io/v3/poi/";
const KM_PER_DEG_LAT = 111.32;
const toRad = (d: number) => (d * Math.PI) / 180;
const kmPerDegLon = (lat: number) => KM_PER_DEG_LAT * Math.cos(toRad(lat));

function getKey() {
  const k = process.env.OCM_API_KEY || process.env.OPENCHARGEMAP_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

function bboxToCenterRadius(w: number, s: number, e: number, n: number) {
  const latC = (s + n) / 2;
  const lonC = (w + e) / 2;
  const rLat = Math.abs(n - s) * 0.5 * KM_PER_DEG_LAT;
  const rLon = Math.abs(e - w) * 0.5 * kmPerDegLon(latC);
  return { latC, lonC, radiusKm: Math.max(rLat, rLon) };
}
function minRadius(input: string | undefined, floorKm: number) {
  const n = input ? Number(input) : NaN;
  return !isFinite(n) || n <= 0 ? floorKm : Math.max(n, floorKm);
}
function insideBBox(lat: number, lon: number, w: number, s: number, e: number, n: number) {
  return lon >= w && lon <= e && lat >= s && lat <= n;
}
function mapPOI(poi: any) {
  const ai = poi?.AddressInfo || {};
  const conns = Array.isArray(poi?.Connections) ? poi.Connections : [];
  const maxPower = conns.reduce((m: number, c: any) => {
    const p = Number(c?.PowerKW ?? 0);
    return isFinite(p) ? Math.max(m, p) : m;
  }, 0);
  return {
    id: poi?.ID ?? null,
    lat: ai?.Latitude ?? null,
    lon: ai?.Longitude ?? null,
    name: ai?.Title ?? "EV charge point",
    addr: [ai?.AddressLine1, ai?.Town, ai?.Postcode].filter(Boolean).join(", "),
    postcode: ai?.Postcode ?? null,
    status: poi?.StatusType?.IsOperational === false ? "down" : "up",
    connectors: conns.length,
    maxPowerKw: maxPower,
    source: "ocm",
  };
}

async function loadSeedSites() {
  const file = process.env.SEED_PATH || "public/data/seed-london.geojson";
  try {
    const p = path.join(process.cwd(), file);
    const raw = await fs.readFile(p, "utf8");
    const gj = JSON.parse(raw);
    const feats = Array.isArray(gj?.features) ? gj.features : [];
    return feats
      .map((f: any, i: number) => {
        const c = f?.geometry?.coordinates;
        const [lon, lat] = Array.isArray(c) && c.length >= 2 ? c : [null, null];
        return {
          id: f?.id ?? f?.properties?.id ?? 9000000 + i,
          lat,
          lon,
          name: f?.properties?.name || "EV charge point",
          addr: f?.properties?.addr || "",
          postcode: f?.properties?.postcode || null,
          status: "up",
          connectors: f?.properties?.connectors ?? 2,
          maxPowerKw: f?.properties?.maxPowerKw ?? 22,
          source: "seed",
        };
      })
      .filter((s: any) => s.lat != null && s.lon != null);
  } catch {
    // tiny inline fallback if file missing
    return [
      { id: 9000001, lat: 51.523, lon: -0.128, name: "Russell Sq (seed)", addr: "WC1", postcode: "WC1B", status: "up", connectors: 2, maxPowerKw: 22, source: "seed" },
      { id: 9000002, lat: 51.516, lon: -0.142, name: "Soho (seed)",        addr: "W1",  postcode: "W1D",  status: "up", connectors: 4, maxPowerKw: 50, source: "seed" },
      { id: 9000003, lat: 51.514, lon: -0.098, name: "City (seed)",        addr: "EC4", postcode: "EC4M", status: "up", connectors: 3, maxPowerKw: 22, source: "seed" },
    ];
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const sp = req.query as Record<string, string>;
  const dbg = sp.debug === "1";

  // Source selection & live toggle
  const LIVE = (process.env.LIVE_DATA || "on").toLowerCase() !== "off";
  const sourceRaw = (sp.source || process.env.DEFAULT_SOURCE || "ocm").toLowerCase();

  // BBox → center+radius (min 6km). Fallback to central London if missing.
  let latC: number | null = null, lonC: number | null = null;
  let w: number | null = null, s: number | null = null, e: number | null = null, n: number | null = null;
  let radiusKm = 6;
  if (sp.bbox) {
    const v = String(sp.bbox).split(",").map((x) => Number(x.trim()));
    if (v.length === 4 && v.every(Number.isFinite)) {
      [w, s, e, n] = v as [number, number, number, number];
      const r = bboxToCenterRadius(w!, s!, e!, n!);
      latC = r.latC; lonC = r.lonC;
      radiusKm = minRadius(sp.radiusKm, Math.max(6, r.radiusKm));
    }
  }
  if (latC == null || lonC == null) { latC = 51.5074; lonC = -0.1278; }

  // Seed mode (LIVE_DATA=off or source=seed)
  if (!LIVE || sourceRaw === "seed") {
    const sites = await loadSeedSites();
    const filtered =
      w != null && s != null && e != null && n != null
        ? sites.filter((p) => insideBBox(p.lat, p.lon, w!, s!, e!, n!))
        : sites;

    const payload: any = { sites: filtered };
    if (dbg) payload.debug = { mode: "seed", count: filtered.length };
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(payload);
  }

  // Council mode (optional raw GeoJSON)
  if (sourceRaw === "council") {
    const url = process.env.COUNCIL_URL;
    if (!url) return res.status(500).json({ error: "COUNCIL_URL not set" });
    try {
      const r = await fetch(url, { cache: "no-store" });
      const gj = await r.json();
      const feats = Array.isArray(gj?.features) ? gj.features : [];
      const mapped = feats
        .map((f: any, i: number) => {
          const [lon, lat] = f?.geometry?.coordinates ?? [];
          return {
            id: f?.id ?? f?.properties?.id ?? 8_000_000 + i,
            lat, lon,
            name: f?.properties?.name || "Council charge point",
            addr: f?.properties?.addr || "",
            postcode: f?.properties?.postcode || null,
            status: "up",
            connectors: f?.properties?.connectors ?? 2,
            maxPowerKw: f?.properties?.maxPowerKw ?? 22,
            source: "council",
          };
        })
        .filter((p: any) => typeof p.lat === "number" && typeof p.lon === "number");

      const filtered =
        w != null && s != null && e != null && n != null
          ? mapped.filter((p) => insideBBox(p.lat, p.lon, w!, s!, e!, n!))
          : mapped;

      const payload: any = { sites: filtered };
      if (dbg) payload.debug = { mode: "council", count: filtered.length, url };
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(payload);
    } catch (e: any) {
      return res.status(502).json({ error: "Council fetch failed", message: String(e) });
    }
  }

  // OCM live mode (default)
  const key = getKey();
  const headers: HeadersInit = { "User-Agent": "Autodun/1.0" };
  if (key) (headers as any)["X-API-Key"] = key;

  async function fetchOCM(distKm: number) {
    const u = new URL(OCM_BASE);
    u.searchParams.set("output", "json");
    u.searchParams.set("compact", "true");
    u.searchParams.set("verbose", "false");
    u.searchParams.set("maxresults", "1000");
    u.searchParams.set("latitude", String(latC));
    u.searchParams.set("longitude", String(lonC));
    u.searchParams.set("distance", String(distKm));
    u.searchParams.set("distanceunit", "KM");
    if (key) u.searchParams.set("key", key);
    if (sp.conn) u.searchParams.set("connectiontypeid", sp.conn);
    if (sp.minPower) u.searchParams.set("minpowerkw", sp.minPower);

    const urlUsed = u.toString();
    const r = await fetch(urlUsed, { headers, cache: "no-store" });
    const status = r.status;
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw { status, urlUsed, message: `OCM ${status}: ${text.slice(0, 300)}` };
    }
    const data = await r.json();
    const arr = Array.isArray(data) ? data : [];
    return { urlUsed, status, sites: arr.map(mapPOI).filter((s) => s.lat != null && s.lon != null) };
  }

  try {
    let { urlUsed, status, sites } = await fetchOCM(radiusKm);
    if (sites.length === 0) {
      ({ urlUsed, status, sites } = await fetchOCM(Math.max(radiusKm, 10)));
    }
    const payload: any = { sites };
    if (dbg) payload.debug = { mode: "ocm", count: sites.length, authed: !!key, ocmStatus: status, ocmUrlUsed: urlUsed };
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(payload);
  } catch (e: any) {
    // Return explicit failure so you can see exactly what's wrong
    return res.status(502).json({ error: "OCM fetch failed", authed: !!key, ...e });
  }
}

// lib/data-sources.js

const DEMO_DATA = [
  { id: "demo1", lat: 51.5074, lng: -0.1278, name: "ChargePoint London", address: "Oxford St, London", postcode: "W1D 1BS", connectors: 2, source: "DEMO" },
  { id: "demo2", lat: 51.5155, lng: -0.0922, name: "Tesla Supercharger", address: "City Road, London", postcode: "EC1Y 2BJ", connectors: 8, source: "DEMO" },
  { id: "demo3", lat: 52.4862, lng: -1.8904, name: "BP Pulse Birmingham", address: "High St, Birmingham", postcode: "B4 7SL", connectors: 4, source: "DEMO" },
  { id: "demo4", lat: 53.4808, lng: -2.2426, name: "Shell Recharge Manchester", address: "Market St, Manchester", postcode: "M1 1WA", connectors: 6, source: "DEMO" },
  { id: "demo5", lat: 51.4545, lng: -2.5879, name: "Ionity Bristol", address: "Temple Way, Bristol", postcode: "BS1 6QS", connectors: 6, source: "DEMO" }
];

/* ─────────────── Connector normalization helpers ─────────────── */

const canonConnector = (raw) => {
  if (!raw) return "Unknown";
  const t = String(raw).toLowerCase();
  if (t.includes("ccs") || t.includes("combo 2") || t.includes("combo type 2")) return "CCS";
  if (t.includes("chademo")) return "CHAdeMO";
  if (t.includes("type 2") || (t.includes("iec 62196") && t.includes("type 2")) || (t.includes("tesla") && t.includes("type 2"))) return "Type 2";
  return typeof raw === "string" ? raw.trim() : "Unknown";
};

const toNum = (v, d = undefined) => {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : d;
};

function extractConnectors(raw, source) {
  // 1) OpenChargeMap: use Connections[]
  if (Array.isArray(raw?.Connections) && raw.Connections.length) {
    const connectors = raw.Connections.map((c) => {
      const rawType =
        c?.ConnectionType?.Title ??
        c?.ConnectionType?.FormalName ??
        c?.CurrentType?.Title ??
        c?.Level?.Title ??
        "Unknown";
      return {
        type: canonConnector(rawType),
        quantity: typeof c?.Quantity === "number" && c.Quantity > 0 ? c.Quantity : 1,
        powerKW: toNum(c?.PowerKW),
      };
    });

    const hasCCS = connectors.some((c) => c.type === "CCS");
    const hasCHAdeMO = connectors.some((c) => c.type === "CHAdeMO");
    const hasType2 = connectors.some((c) => c.type === "Type 2");

    return { connectors, hasCCS, hasCHAdeMO, hasType2 };
  }

  // 2) Other sources with a numeric count -> represent as Unknown × count
  const count =
    toNum(raw?.connectors) ??
    toNum(raw?.NumberOfPoints) ??
    (Array.isArray(raw?.Connections) ? raw.Connections.length : undefined);

  if (typeof count === "number" && count > 0) {
    const connectors = [{ type: "Unknown", quantity: count }];
    return { connectors, hasCCS: false, hasCHAdeMO: false, hasType2: false };
  }

  // 3) Nothing we can infer
  return { connectors: [], hasCCS: false, hasCHAdeMO: false, hasType2: false };
}

/* ─────────────── Station normalizer ─────────────── */

function normalizeStation(raw, source) {
  const id =
    raw.id ||
    raw.ID ||
    `${source}-${Math.random().toString(36).substr(2, 9)}`;

  const lat = parseFloat(
    raw.lat || raw.latitude || raw.AddressInfo?.Latitude || 0
  );
  const lng = parseFloat(
    raw.lng || raw.longitude || raw.AddressInfo?.Longitude || 0
  );

  const name = raw.name || raw.AddressInfo?.Title || "EV Station";
  const address = raw.address || raw.AddressInfo?.AddressLine1 || "";
  const postcode = raw.postcode || raw.AddressInfo?.Postcode || "";

  // Build normalized connectors + boolean flags
  const norm = extractConnectors(raw, source);

  // We also keep a simple "connectors" count for legacy code paths
  const connectorsCount =
    toNum(raw.connectors) ||
    toNum(raw.NumberOfPoints) ||
    (Array.isArray(raw?.Connections) ? raw.Connections.length : undefined) ||
    (Array.isArray(norm.connectors) && norm.connectors.length
      ? norm.connectors.reduce(
          (sum, c) => sum + (typeof c.quantity === "number" ? c.quantity : 1),
          0
        )
      : 1);

  return {
    id,
    lat,
    lng,
    name,
    address,
    postcode,
    // legacy numeric count (some UI reads this)
    connectors: connectorsCount,
    // new canonical structure used by drawer & filters
    connectorsDetailed: norm.connectors, // <— NEW field (non-breaking add)
    hasCCS: norm.hasCCS,
    hasCHAdeMO: norm.hasCHAdeMO,
    hasType2: norm.hasType2,
    source,
  };
}

/* ─────────────── Data sources ─────────────── */

async function fetchDemo() {
  // also add a basic connectorsDetailed so filters work here too
  const items = DEMO_DATA.map((d) =>
    normalizeStation(
      { ...d, connectors: d.connectors },
      "DEMO"
    )
  );
  return { items, count: items.length, source: "DEMO" };
}

async function fetchStatic() {
  try {
    const fs = require("fs").promises;
    const path = require("path");
    const filePath = path.join(process.cwd(), "public", "data", "static-stations.json");
    const data = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(data);
    const items = (parsed.items || parsed)
      .map((s) => normalizeStation(s, "STATIC"))
      .filter((s) => s.lat && s.lng);
    return { items, count: items.length, source: "STATIC" };
  } catch (error) {
    console.error("Static data fetch failed:", error.message);
    throw error;
  }
}

async function fetchOpenCharge(apiKey, lat = 51.5074, lng = -0.1278, distanceKm = 50, maxResults = 1000, clientId = null) {
  if (!apiKey) throw new Error("OCM_API_KEY not provided");
  try {
    const params = new URLSearchParams({
      key: apiKey,
      countrycode: "GB",
      latitude: String(lat),
      longitude: String(lng),
      distance: String(distanceKm),
      distanceunit: "KM",
      maxresults: String(maxResults),
      compact: "true",
      verbose: "false",
    });

    const headers = { Accept: "application/json" };
    if (clientId) headers["X-API-Client"] = clientId;

    const response = await fetch(`https://api.openchargemap.io/v3/poi/?${params}`, {
      headers,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`OpenCharge API returned ${response.status}`);

    const data = await response.json();
    const items = (Array.isArray(data) ? data : [])
      .map((s) => normalizeStation(s, "OPENCHARGE"))
      .filter((s) => s.lat && s.lng);

    return { items, count: items.length, source: "OPENCHARGE" };
  } catch (error) {
    console.error("OpenCharge fetch failed:", error.message);
    throw error;
  }
}

async function fetchOpenChargeBBox(apiKey, bbox, maxResults = 500, clientId = null) {
  if (!apiKey) throw new Error("OCM_API_KEY not provided");
  try {
    const params = new URLSearchParams({
      key: apiKey,
      countrycode: "GB",
      boundingbox: `(${bbox.south},${bbox.west}),(${bbox.north},${bbox.east})`,
      maxresults: String(maxResults),
      compact: "true",
      verbose: "false",
    });

    const headers = { Accept: "application/json" };
    if (clientId) headers["X-API-Client"] = clientId;

    const response = await fetch(`https://api.openchargemap.io/v3/poi/?${params}`, {
      headers,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`OpenCharge API returned ${response.status}`);

    const data = await response.json();
    const items = (Array.isArray(data) ? data : [])
      .map((s) => normalizeStation(s, "OPENCHARGE"))
      .filter((s) => s.lat && s.lng);

    return { items, count: items.length, source: "OPENCHARGE" };
  } catch (error) {
    console.error(
      `OpenCharge bbox fetch failed (${bbox.west},${bbox.south} to ${bbox.east},${bbox.north}):`,
      error.message
    );
    throw error;
  }
}

async function fetchCustom(url) {
  if (!url) throw new Error("STATIONS_URL not provided");
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Custom URL returned ${response.status}`);
    const data = await response.json();
    const items = (data.items || data.stations || data)
      .map((s) => normalizeStation(s, "CUSTOM"))
      .filter((s) => s.lat && s.lng);
    return { items, count: items.length, source: "CUSTOM" };
  } catch (error) {
    console.error("Custom URL fetch failed:", error.message);
    throw error;
  }
}

/* ─────────────── Public functions ─────────────── */

export async function fetchTiledStations(bbox, tiles = 3, limitPerTile = 500, sourceOverride = null) {
  const source = sourceOverride || process.env.STATIONS_SOURCE || process.env.STATIONS || "DEMO";
  const ocmApiKey = process.env.OCM_API_KEY;
  const ocmClient = process.env.OCM_CLIENT;

  console.log(
    `[fetchTiledStations] Fetching ${tiles}x${tiles} tiles from bbox (${bbox.west},${bbox.south}) to (${bbox.east},${bbox.north})`
  );

  if (source.toUpperCase() !== "OPENCHARGE" && source.toUpperCase() !== "OCM") {
    console.log("[fetchTiledStations] Tiled fetch only supports OPENCHARGE, falling back to regular fetch");
    const center = { lat: (bbox.north + bbox.south) / 2, lng: (bbox.east + bbox.west) / 2 };
    const radius =
      Math.sqrt(
        Math.pow((bbox.north - bbox.south) * 111, 2) + Math.pow((bbox.east - bbox.west) * 85, 2)
      ) / 2;
    return fetchStations(center.lat, center.lng, Math.min(radius, 250), sourceOverride, limitPerTile * tiles);
  }

  try {
    const { splitBBoxIntoTiles } = await import("../utils/geo.ts");
    const { getTileCached, setTileCache } = await import("./lru-cache.js");

    const tileList = splitBBoxIntoTiles(bbox, tiles);
    console.log(`[fetchTiledStations] Split into ${tileList.length} tiles`);

    const fetchPromises = tileList.map(async (tile) => {
      const cached = getTileCached(tile.hash);
      if (cached) {
        console.log(`[fetchTiledStations] Cache hit for ${tile.hash}`);
        return cached;
      }

      const result = await fetchOpenChargeBBox(ocmApiKey, tile, limitPerTile, ocmClient);
      setTileCache(tile.hash, result);
      return result;
    });

    const results = await Promise.all(fetchPromises);

    const allStations = new Map();
    results.forEach((result) => {
      result.items.forEach((station) => {
        if (!allStations.has(station.id)) allStations.set(station.id, station);
      });
    });

    const items = Array.from(allStations.values());
    console.log(`[fetchTiledStations] Success: ${items.length} unique stations from ${tileList.length} tiles`);

    return {
      items,
      count: items.length,
      source: "OPENCHARGE",
      bbox,
      tiles: tileList.length,
    };
  } catch (error) {
    console.error("[fetchTiledStations] Error:", error.message);
    throw error;
  }
}

export async function fetchStations(lat = 51.5074, lng = -0.1278, distanceKm = 50, sourceOverride = null, maxResults = 1000) {
  const source = sourceOverride || process.env.STATIONS_SOURCE || process.env.STATIONS || "DEMO";
  const ocmApiKey = process.env.OCM_API_KEY;
  const ocmClient = process.env.OCM_CLIENT;

  console.log(
    `[fetchStations] Attempting source: ${source} (lat: ${lat}, lng: ${lng}, radius: ${distanceKm}km, max: ${maxResults})`
  );

  try {
    let result;
    const sourceUpper = source.toUpperCase();
    switch (sourceUpper) {
      case "OPENCHARGE":
      case "OCM":
        result = await fetchOpenCharge(ocmApiKey, lat, lng, distanceKm, maxResults, ocmClient);
        break;
      case "STATIC":
        result = await fetchStatic();
        break;
      case "CUSTOM_URL":
        result = await fetchCustom(process.env.STATIONS_URL);
        break;
      case "DEMO":
      default:
        result = await fetchDemo();
        break;
    }
    if (result.items && result.items.length > 0) {
      console.log(`[fetchStations] Success: ${result.count} stations from ${result.source}`);
      return result;
    }
  } catch (error) {
    console.error(`[fetchStations] ${source} failed:`, error.message);
  }

  if (source.toUpperCase() !== "STATIC" && source.toUpperCase() !== "DEMO") {
    try {
      console.log(`[fetchStations] Falling back to STATIC`);
      const staticResult = await fetchStatic();
      return { ...staticResult, fellBack: true, originalSource: source };
    } catch (staticError) {
      console.error(`[fetchStations] STATIC fallback failed:`, staticError.message);
    }
  }

  console.log(`[fetchStations] Final fallback to DEMO`);
  const demoResult = await fetchDemo();
  return { ...demoResult, fellBack: true, originalSource: source };
}

export { DEMO_DATA };

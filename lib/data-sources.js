// lib/data-sources.js
import { debugLog } from "../utils/debug";

const DEMO_DATA = [
  {
    id: "demo1",
    lat: 51.5074,
    lng: -0.1278,
    name: "ChargePoint London",
    address: "Oxford St, London",
    postcode: "W1D 1BS",
    connectors: 2,
    source: "DEMO",
  },
  {
    id: "demo2",
    lat: 51.5155,
    lng: -0.0922,
    name: "Tesla Supercharger",
    address: "City Road, London",
    postcode: "EC1Y 2BJ",
    connectors: 8,
    source: "DEMO",
  },
  {
    id: "demo3",
    lat: 52.4862,
    lng: -1.8904,
    name: "BP Pulse Birmingham",
    address: "High St, Birmingham",
    postcode: "B4 7SL",
    connectors: 4,
    source: "DEMO",
  },
  {
    id: "demo4",
    lat: 53.4808,
    lng: -2.2426,
    name: "Shell Recharge Manchester",
    address: "Market St, Manchester",
    postcode: "M1 1WA",
    connectors: 6,
    source: "DEMO",
  },
  {
    id: "demo5",
    lat: 51.4545,
    lng: -2.5879,
    name: "Ionity Bristol",
    address: "Temple Way, Bristol",
    postcode: "BS1 6QS",
    connectors: 6,
    source: "DEMO",
  },
];

function normalizeStation(raw, source) {
  // Normalize connector data - preserve detailed array if available, otherwise create from OCM Connections
  let connectors = raw.connectors;
  let connectorsDetailed = null;

  if (!connectors && raw.Connections && Array.isArray(raw.Connections)) {
    // Map OCM Connections to normalized connector format with fallback for OCM connector IDs
    const ocmIdMap = {
      1: "Type 1 (J1772)",
      2: "CHAdeMO",
      8: "Type 3",
      25: "Type 2 (Socket Only)",
      27: "Type 2 (Tethered Connector)",
      30: "Tesla (Roadster)",
      32: "CCS (Type 2)",
      33: "CCS (SAE)",
      1036: "Type 2 (Tethered)",
    };

    connectorsDetailed = raw.Connections.map((c) => {
      let type = c?.ConnectionType?.Title || "Unknown";
      // Fallback: Try to map OCM ConnectionTypeID to known type
      if (type === "Unknown" && c?.ConnectionTypeID) {
        type = ocmIdMap[c.ConnectionTypeID] || "Unknown";
      }
      return {
        type: type,
        powerKW: c?.PowerKW || undefined,
        quantity: c?.Quantity || 1,
      };
    }); // Keep ALL connectors including Unknown

    connectors = connectorsDetailed.reduce((sum, c) => sum + (c.quantity || 1), 0);
  }

  if (typeof connectors !== "number") {
    connectors = raw.NumberOfPoints || 1;
  }

  return {
    id: raw.id || raw.ID || `${source}-${Math.random().toString(36).substr(2, 9)}`,
    lat: parseFloat(raw.lat || raw.latitude || raw.AddressInfo?.Latitude || 0),
    lng: parseFloat(raw.lng || raw.longitude || raw.AddressInfo?.Longitude || 0),
    name: raw.name || raw.AddressInfo?.Title || "EV Station",
    address: raw.address || raw.AddressInfo?.AddressLine1 || "",
    postcode: raw.postcode || raw.AddressInfo?.Postcode || "",
    connectors: connectors,
    connectorsDetailed: connectorsDetailed,
    source: source,
  };
}

async function fetchDemo() {
  return { items: DEMO_DATA, count: DEMO_DATA.length, source: "DEMO" };
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

async function fetchOpenCharge(
  apiKey,
  lat = 51.5074,
  lng = -0.1278,
  distanceKm = 50,
  maxResults = 1000,
  clientId = null
) {
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
    if (clientId) {
      headers["X-API-Client"] = clientId;
    }

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
    if (clientId) {
      headers["X-API-Client"] = clientId;
    }

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

export async function fetchTiledStations(bbox, tiles = 3, limitPerTile = 500, sourceOverride = null) {
  const source = sourceOverride || process.env.STATIONS_SOURCE || process.env.STATIONS || "DEMO";
  const ocmApiKey = process.env.OCM_API_KEY;
  const ocmClient = process.env.OCM_CLIENT;

  debugLog(
    `[fetchTiledStations] Fetching ${tiles}x${tiles} tiles from bbox (${bbox.west},${bbox.south}) to (${bbox.east},${bbox.north})`
  );

  if (source.toUpperCase() !== "OPENCHARGE" && source.toUpperCase() !== "OCM") {
    debugLog(
      "[fetchTiledStations] Tiled fetch only supports OPENCHARGE, falling back to regular fetch"
    );
    const center = {
      lat: (bbox.north + bbox.south) / 2,
      lng: (bbox.east + bbox.west) / 2,
    };
    const radius =
      Math.sqrt(
        Math.pow((bbox.north - bbox.south) * 111, 2) +
          Math.pow((bbox.east - bbox.west) * 85, 2)
      ) / 2;
    return fetchStations(center.lat, center.lng, Math.min(radius, 250), sourceOverride, limitPerTile * tiles);
  }

  try {
    const { splitBBoxIntoTiles } = await import("../utils/geo.ts");
    const { getTileCached, setTileCache } = await import("./lru-cache.js");

    const tileList = splitBBoxIntoTiles(bbox, tiles);
    debugLog(`[fetchTiledStations] Split into ${tileList.length} tiles`);

    const fetchPromises = tileList.map(async (tile) => {
      const cached = getTileCached(tile.hash);
      if (cached) {
        debugLog(`[fetchTiledStations] Cache hit for ${tile.hash}`);
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
        if (!allStations.has(station.id)) {
          allStations.set(station.id, station);
        }
      });
    });

    const items = Array.from(allStations.values());
    debugLog(
      `[fetchTiledStations] Success: ${items.length} unique stations from ${tileList.length} tiles`
    );

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

export async function fetchStations(
  lat = 51.5074,
  lng = -0.1278,
  distanceKm = 50,
  sourceOverride = null,
  maxResults = 1000
) {
  const source = sourceOverride || process.env.STATIONS_SOURCE || process.env.STATIONS || "DEMO";
  const ocmApiKey = process.env.OCM_API_KEY;
  const ocmClient = process.env.OCM_CLIENT;

  debugLog(
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
      debugLog(`[fetchStations] Success: ${result.count} stations from ${result.source}`);
      return result;
    }
  } catch (error) {
    console.error(`[fetchStations] ${source} failed:`, error.message);
  }

  if (source.toUpperCase() !== "STATIC" && source.toUpperCase() !== "DEMO") {
    try {
      debugLog("[fetchStations] Falling back to STATIC");
      const staticResult = await fetchStatic();
      return { ...staticResult, fellBack: true, originalSource: source };
    } catch (staticError) {
      console.error(
        "[fetchStations] STATIC fallback failed:",
        staticError.message
      );
    }
  }

  debugLog("[fetchStations] Final fallback to DEMO");
  const demoResult = await fetchDemo();
  return { ...demoResult, fellBack: true, originalSource: source };
}

export { DEMO_DATA };

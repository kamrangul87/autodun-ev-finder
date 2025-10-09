// lib/data-sources.js
const DEMO_DATA = [
  { id: "demo1", lat: 51.5074, lng: -0.1278, name: "ChargePoint London", address: "Oxford St, London", postcode: "W1D 1BS", connectors: 2, source: "DEMO" },
  { id: "demo2", lat: 51.5155, lng: -0.0922, name: "Tesla Supercharger", address: "City Road, London", postcode: "EC1Y 2BJ", connectors: 8, source: "DEMO" },
  { id: "demo3", lat: 52.4862, lng: -1.8904, name: "BP Pulse Birmingham", address: "High St, Birmingham", postcode: "B4 7SL", connectors: 4, source: "DEMO" },
  { id: "demo4", lat: 53.4808, lng: -2.2426, name: "Shell Recharge Manchester", address: "Market St, Manchester", postcode: "M1 1WA", connectors: 6, source: "DEMO" },
  { id: "demo5", lat: 51.4545, lng: -2.5879, name: "Ionity Bristol", address: "Temple Way, Bristol", postcode: "BS1 6QS", connectors: 6, source: "DEMO" }
];

function normalizeStation(raw, source) {
  return {
    id: raw.id || raw.ID || `${source}-${Math.random().toString(36).substr(2, 9)}`,
    lat: parseFloat(raw.lat || raw.latitude || raw.AddressInfo?.Latitude || 0),
    lng: parseFloat(raw.lng || raw.longitude || raw.AddressInfo?.Longitude || 0),
    name: raw.name || raw.AddressInfo?.Title || "EV Station",
    address: raw.address || raw.AddressInfo?.AddressLine1 || "",
    postcode: raw.postcode || raw.AddressInfo?.Postcode || "",
    connectors: raw.connectors || raw.NumberOfPoints || raw.Connections?.length || 1,
    source: source
  };
}

async function fetchDemo() {
  return { items: DEMO_DATA, count: DEMO_DATA.length, source: 'DEMO' };
}

async function fetchStatic() {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const filePath = path.join(process.cwd(), 'public', 'data', 'static-stations.json');
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    const items = (parsed.items || parsed).map(s => normalizeStation(s, 'STATIC')).filter(s => s.lat && s.lng);
    return { items, count: items.length, source: 'STATIC' };
  } catch (error) {
    console.error('Static data fetch failed:', error.message);
    throw error;
  }
}

async function fetchOpenCharge(apiKey, lat = 51.5074, lng = -0.1278, distanceKm = 50) {
  if (!apiKey) throw new Error('OCM_API_KEY not provided');
  try {
    const params = new URLSearchParams({
      key: apiKey,
      countrycode: 'GB',
      latitude: String(lat),
      longitude: String(lng),
      distance: String(distanceKm),
      distanceunit: 'KM',
      maxresults: '500',
      compact: 'true',
      verbose: 'false'
    });
    const response = await fetch(`https://api.openchargemap.io/v3/poi/?${params}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error(`OpenCharge API returned ${response.status}`);
    const data = await response.json();
    const items = (Array.isArray(data) ? data : []).map(s => normalizeStation(s, 'OPENCHARGE')).filter(s => s.lat && s.lng);
    return { items, count: items.length, source: 'OPENCHARGE' };
  } catch (error) {
    console.error('OpenCharge fetch failed:', error.message);
    throw error;
  }
}

async function fetchCustom(url) {
  if (!url) throw new Error('STATIONS_URL not provided');
  try {
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error(`Custom URL returned ${response.status}`);
    const data = await response.json();
    const items = (data.items || data.stations || data).map(s => normalizeStation(s, 'CUSTOM')).filter(s => s.lat && s.lng);
    return { items, count: items.length, source: 'CUSTOM' };
  } catch (error) {
    console.error('Custom URL fetch failed:', error.message);
    throw error;
  }
}

export async function fetchStations(lat = 51.5074, lng = -0.1278, distanceKm = 50, sourceOverride = null) {
  const source = sourceOverride || process.env.STATIONS || 'DEMO';
  console.log(`[fetchStations] Attempting source: ${source} (lat: ${lat}, lng: ${lng}, distance: ${distanceKm}km)`);
  
  // Try primary source
  try {
    let result;
    const sourceUpper = source.toUpperCase();
    switch (sourceUpper) {
      case 'OPENCHARGE':
      case 'OCM':
        result = await fetchOpenCharge(process.env.OCM_API_KEY, lat, lng, distanceKm);
        break;
      case 'STATIC':
        result = await fetchStatic();
        break;
      case 'CUSTOM_URL':
        result = await fetchCustom(process.env.STATIONS_URL);
        break;
      case 'DEMO':
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

  // Fallback chain: STATIC → DEMO
  if (source.toUpperCase() !== 'STATIC' && source.toUpperCase() !== 'DEMO') {
    try {
      console.log(`[fetchStations] Falling back to STATIC`);
      const staticResult = await fetchStatic();
      return { ...staticResult, fellBack: true, originalSource: source };
    } catch (staticError) {
      console.error(`[fetchStations] STATIC fallback failed:`, staticError.message);
    }
  }

  // Final fallback to DEMO
  console.log(`[fetchStations] Final fallback to DEMO`);
  const demoResult = await fetchDemo();
  return { ...demoResult, fellBack: true, originalSource: source };
}

export { DEMO_DATA };

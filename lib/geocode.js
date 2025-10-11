import { UK_BOUNDS } from '../utils/geo';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const UK_VIEWBOX = `${UK_BOUNDS.west},${UK_BOUNDS.north},${UK_BOUNDS.east},${UK_BOUNDS.south}`;

export async function geocodeUKBiased(searchTerm) {
  if (!searchTerm || !searchTerm.trim()) {
    return { error: 'Please enter a search term' };
  }

  const params = new URLSearchParams({
    q: searchTerm.trim(),
    format: 'json',
    countrycodes: 'gb',
    limit: '1',
    bounded: '1',
    viewbox: UK_VIEWBOX,
    addressdetails: '1'
  });

  try {
    const response = await fetch(`${NOMINATIM_BASE}?${params}`, {
      headers: {
        'User-Agent': 'Autodun-EV-Finder/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned ${response.status}`);
    }

    const results = await response.json();

    if (!results || results.length === 0) {
      return { 
        error: 'Place not found in the UK',
        shouldShowToast: true 
      };
    }

    const result = results[0];
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    if (isOutsideUK(lat, lng)) {
      console.warn('[geocode] Result outside UK bounds, clamping:', { lat, lng });
      const clamped = clampToUKBounds(lat, lng);
      return {
        ...result,
        lat: clamped.lat,
        lng: clamped.lng,
        display_name: result.display_name,
        boundingbox: result.boundingbox,
        address: result.address,
        clamped: true
      };
    }

    return {
      lat,
      lng,
      display_name: result.display_name,
      boundingbox: result.boundingbox,
      address: result.address
    };
  } catch (error) {
    console.error('[geocode] Nominatim error:', error);
    return { error: 'Search service unavailable. Please try again.' };
  }
}

export function isOutsideUK(lat, lng) {
  return (
    lat < UK_BOUNDS.south ||
    lat > UK_BOUNDS.north ||
    lng < UK_BOUNDS.west ||
    lng > UK_BOUNDS.east
  );
}

export function clampToUKBounds(lat, lng) {
  return {
    lat: Math.max(UK_BOUNDS.south, Math.min(UK_BOUNDS.north, lat)),
    lng: Math.max(UK_BOUNDS.west, Math.min(UK_BOUNDS.east, lng))
  };
}

export function extractRegionName(geocodeResult) {
  if (!geocodeResult || !geocodeResult.address) {
    return 'United Kingdom';
  }

  const addr = geocodeResult.address;
  
  if (addr.city) return addr.city;
  if (addr.town) return addr.town;
  if (addr.village) return addr.village;
  if (addr.county) return addr.county;
  if (addr.state) return addr.state;
  if (addr.region) return addr.region;
  
  return 'United Kingdom';
}

export async function geocodeFromQueryParam(qParam) {
  if (!qParam) return null;

  const result = await geocodeUKBiased(qParam);
  
  if (result.error) {
    console.warn('[geocode] Query param geocoding failed:', result.error);
    return null;
  }

  return result;
}

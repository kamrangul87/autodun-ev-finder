import { geocodeUKBiased, isOutsideUK, clampToUKBounds, extractRegionName } from './geocode';

async function searchPostcodesIO(query) {
  try {
    const cleanQuery = query.trim().replace(/\s+/g, '');
    const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleanQuery)}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.status === 200 && data.result) {
      const lat = data.result.latitude;
      const lng = data.result.longitude;
      
      if (isOutsideUK(lat, lng)) {
        console.warn('[postcodes.io] Result outside UK bounds, clamping');
        const clamped = clampToUKBounds(lat, lng);
        return {
          lat: clamped.lat,
          lng: clamped.lng,
          display_name: `${data.result.postcode}, ${data.result.admin_district || 'UK'}`,
          source: 'postcodes.io',
          postcode: data.result.postcode,
          district: data.result.admin_district,
          regionName: data.result.admin_district || 'United Kingdom',
          clamped: true
        };
      }
      
      return {
        lat,
        lng,
        display_name: `${data.result.postcode}, ${data.result.admin_district || 'UK'}`,
        source: 'postcodes.io',
        postcode: data.result.postcode,
        district: data.result.admin_district,
        regionName: data.result.admin_district || 'United Kingdom'
      };
    }
    return null;
  } catch (error) {
    console.error('[postcodes.io] Error:', error.message);
    return null;
  }
}

export async function searchLocation(query) {
  if (!query || query.trim().length === 0) throw new Error('Search query is empty');
  console.log(`[searchLocation] Query: "${query}"`);
  
  let result = await searchPostcodesIO(query);
  if (result) {
    console.log(`[searchLocation] Found via postcodes.io`);
    return result;
  }
  
  console.log(`[searchLocation] Falling back to UK-biased geocoding`);
  const geocodeResult = await geocodeUKBiased(query);
  
  if (geocodeResult.error) {
    throw new Error(geocodeResult.error);
  }
  
  console.log(`[searchLocation] Found via UK-biased geocoding`);
  return {
    ...geocodeResult,
    source: 'nominatim',
    regionName: extractRegionName(geocodeResult)
  };
}

export function isLikelyPostcode(query) {
  const postcodePattern = /^[A-Z]{1,2}[0-9]{1,2}[A-Z]?\s?[0-9][A-Z]{2}$/i;
  return postcodePattern.test(query.trim().replace(/\s+/g, ' '));
}

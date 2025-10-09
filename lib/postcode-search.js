// lib/postcode-search.js
async function searchPostcodesIO(query) {
  try {
    const cleanQuery = query.trim().replace(/\s+/g, '');
    const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleanQuery)}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.status === 200 && data.result) {
      return {
        lat: data.result.latitude,
        lng: data.result.longitude,
        display_name: `${data.result.postcode}, ${data.result.admin_district || 'UK'}`,
        source: 'postcodes.io',
        postcode: data.result.postcode,
        district: data.result.admin_district
      };
    }
    return null;
  } catch (error) {
    console.error('[postcodes.io] Error:', error.message);
    return null;
  }
}

async function searchNominatim(query) {
  try {
    const params = new URLSearchParams({
      q: query, format: 'json', limit: '1', countrycodes: 'gb', addressdetails: '1'
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'AutodunEVFinder/1.0' }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.length > 0) {
      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        display_name: result.display_name,
        source: 'nominatim',
        address: result.address
      };
    }
    return null;
  } catch (error) {
    console.error('[nominatim] Error:', error.message);
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
  console.log(`[searchLocation] Falling back to Nominatim`);
  result = await searchNominatim(query);
  if (result) {
    console.log(`[searchLocation] Found via Nominatim`);
    return result;
  }
  throw new Error('Location not found');
}

export function isLikelyPostcode(query) {
  const postcodePattern = /^[A-Z]{1,2}[0-9]{1,2}[A-Z]?\s?[0-9][A-Z]{2}$/i;
  return postcodePattern.test(query.trim().replace(/\s+/g, ' '));
}

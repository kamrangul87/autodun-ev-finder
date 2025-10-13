// utils/map-utils.js

export function calculateBoundsRadius(bounds) {
  const center = bounds.getCenter();
  const ne = bounds.getNorthEast();
  
  // Calculate distance from center to corner in km
  const R = 6371; // Earth's radius in km
  const lat1 = center.lat * Math.PI / 180;
  const lat2 = ne.lat * Math.PI / 180;
  const deltaLat = (ne.lat - center.lat) * Math.PI / 180;
  const deltaLng = (ne.lng - center.lng) * Math.PI / 180;
  
  const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
           Math.cos(lat1) * Math.cos(lat2) *
           Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  // Add 20% buffer to ensure coverage
  return Math.ceil(distance * 1.2);
}

export function roundCoords(lat, lng, precision = 2) {
  return {
    lat: parseFloat(lat.toFixed(precision)),
    lng: parseFloat(lng.toFixed(precision))
  };
}

export function getCacheKey(lat, lng, radius) {
  const rounded = roundCoords(lat, lng, 1); // Round to 1 decimal for caching
  return `${rounded.lat},${rounded.lng},${Math.round(radius/5)*5}`; // Round radius to nearest 5km
}

export function computeCentroid(coordinates) {
  // Handle different GeoJSON geometry types
  let allCoords = [];
  
  if (coordinates[0] && Array.isArray(coordinates[0][0])) {
    // Polygon or MultiPolygon
    coordinates[0].forEach(ring => {
      if (Array.isArray(ring) && ring.length === 2 && typeof ring[0] === 'number') {
        allCoords.push(ring);
      } else if (Array.isArray(ring)) {
        allCoords = allCoords.concat(ring);
      }
    });
  } else {
    // Simple coordinate array
    allCoords = coordinates;
  }
  
  if (allCoords.length === 0) return null;
  
  let sumLat = 0, sumLng = 0;
  allCoords.forEach(([lng, lat]) => {
    sumLat += lat;
    sumLng += lng;
  });
  
  return {
    lat: sumLat / allCoords.length,
    lng: sumLng / allCoords.length
  };
}

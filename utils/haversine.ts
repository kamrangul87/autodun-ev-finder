/**
 * Calculate distance between two geographic coordinates using Haversine formula
 * Returns distance in kilometers
 */

interface Coordinates {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate distance between two points in kilometers
 * @param point1 First coordinate {lat, lng}
 * @param point2 Second coordinate {lat, lng}
 * @returns Distance in kilometers
 */
export function haversineDistance(point1: Coordinates, point2: Coordinates): number {
  const lat1 = toRadians(point1.lat);
  const lat2 = toRadians(point2.lat);
  const deltaLat = toRadians(point2.lat - point1.lat);
  const deltaLng = toRadians(point2.lng - point1.lng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Find nearest station from a list
 * @param userLocation User's current location
 * @param stations Array of stations with lat/lng
 * @returns Nearest station with distance
 */
export function findNearestStation(
  userLocation: Coordinates,
  stations: Array<{ id: string; lat: number; lng: number; [key: string]: any }>
): { station: any; distance: number } | null {
  if (!stations.length) return null;

  let nearest = stations[0];
  let minDistance = haversineDistance(userLocation, { lat: nearest.lat, lng: nearest.lng });

  for (let i = 1; i < stations.length; i++) {
    const distance = haversineDistance(userLocation, { 
      lat: stations[i].lat, 
      lng: stations[i].lng 
    });
    
    if (distance < minDistance) {
      minDistance = distance;
      nearest = stations[i];
    }
  }

  return { station: nearest, distance: minDistance };
}

/**
 * Format distance for display
 * @param km Distance in kilometers
 * @returns Formatted string (e.g., "1.2 km" or "350 m")
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

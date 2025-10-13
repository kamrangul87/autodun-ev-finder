// lib/api-cache.js - Client-side cache for API responses

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getCached(key) {
  const cached = cache.get(key);
  if (!cached) return null;
  
  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  
  return cached.data;
}

export function setCache(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
  
  // Cleanup old entries if cache gets too large
  if (cache.size > 50) {
    const sortedEntries = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Remove oldest 25%
    const toRemove = sortedEntries.slice(0, Math.floor(sortedEntries.length / 4));
    toRemove.forEach(([key]) => cache.delete(key));
  }
}

export function clearCache() {
  cache.clear();
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  boundingbox?: [string, string, string, string];
}

let searchTimeout: NodeJS.Timeout;

export async function searchLocation(query: string): Promise<NominatimResult | null> {
  if (!query.trim()) return null;

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?` +
    `q=${encodeURIComponent(query)}&` +
    `format=json&countrycodes=gb&limit=1`,
    {
      headers: {
        'User-Agent': 'autodun.com/1.0',
      },
    }
  );

  if (!response.ok) throw new Error('Search failed');

  const results = await response.json();
  return results[0] || null;
}

export function debouncedSearch(
  query: string,
  callback: (result: NominatimResult | null) => void,
  delay: number = 350
): void {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const result = await searchLocation(query);
      callback(result);
    } catch (error) {
      console.error('Search error:', error);
      callback(null);
    }
  }, delay);
}

export function saveLastSearch(query: string): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('autodun.lastSearch', query);
    } catch (e) {
      console.warn('Failed to save search:', e);
    }
  }
}

export function getLastSearch(): string | null {
  if (typeof window !== 'undefined') {
    try {
      return localStorage.getItem('autodun.lastSearch');
    } catch (e) {
      return null;
    }
  }
  return null;
}

'use client';
import { useState } from 'react';

export default function SearchControl({ onSearch }: { onSearch: (lat: number, lng: number) => void }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
  let result: { lat: number; lng: number } | null = null;
    try {
      // Try api.postcodes.io first
      const res1 = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(query)}`);
      if (res1.ok) {
        const data = await res1.json();
        if (data.result) {
          result = { lat: data.result.latitude, lng: data.result.longitude };
        }
      }
      // Fallback to Nominatim
      if (!result) {
        const res2 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        if (res2.ok) {
          const data = await res2.json();
          if (data[0]) {
            result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
          }
        }
      }
      if (result) {
        onSearch(result.lat, result.lng);
      } else {
        setError('Not found');
      }
    } catch {
      setError('Error searching');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSearch} className="flex gap-2">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Postcode or place"
        className="border px-2 py-1 rounded"
      />
      <button type="submit" disabled={loading} className="bg-blue-600 text-white px-3 py-1 rounded">
        Search
      </button>
      {error && <span className="text-red-500 text-xs">{error}</span>}
    </form>
  );
}

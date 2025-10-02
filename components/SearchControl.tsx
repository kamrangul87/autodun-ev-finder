'use client';

import React, { useRef, useState } from 'react';
import { useMap } from 'react-leaflet';

export default function SearchControl() {
  const map = useMap();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    const q = inputRef.current?.value?.trim();
    if (!q) return;

    try {
      setLoading(true);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          q
        )}&limit=1`
      );
      const data = await res.json();
      if (!Array.isArray(data) || !data[0]) {
        setErr('No results');
        return;
      }
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        map.setView([lat, lon], Math.max(map.getZoom(), 13));
      } else {
        setErr('Bad coordinates');
      }
    } catch (e: any) {
      setErr('Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="leaflet-top leaflet-right z-[500]">
      <div className="leaflet-control p-2 bg-white/95 rounded shadow flex gap-2 items-center">
        <form onSubmit={search} className="flex gap-2 items-center">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search address or place..."
            className="border rounded px-3 py-1 w-[360px] text-sm"
          />
          <button
            type="submit"
            className="px-3 py-1 rounded bg-sky-600 text-white text-sm disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>
        {err && <span className="ml-2 text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';

// tiny debounce
function debounce<T extends (...a: any[]) => void>(fn: T, wait = 300) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

type Suggestion = {
  display_name: string;
  lat: string;
  lon: string;
};

export default function SearchControl() {
  const map = useMap();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const run = useMemo(
    () =>
      debounce(async (query: string) => {
        if (!query || query.length < 3) {
          setItems([]);
          return;
        }
        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=8&q=${encodeURIComponent(
              query,
            )}`,
            {
              signal: ac.signal,
              headers: { 'Accept-Language': 'en' },
            },
          );
          if (!res.ok) throw new Error('search failed');
          const json = (await res.json()) as Suggestion[];
          setItems(json);
          setOpen(true);
        } catch (e: any) {
          if (e?.name !== 'AbortError') console.warn('search error', e);
        } finally {
          if (abortRef.current === ac) abortRef.current = null;
        }
      }, 300),
    [],
  );

  useEffect(() => {
    run(q);
  }, [q, run]);

  function pick(s: Suggestion) {
    const lat = parseFloat(s.lat);
    const lon = parseFloat(s.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      map.flyTo([lat, lon], Math.max(map.getZoom(), 14), { duration: 0.8 });
    }
    setOpen(false);
  }

  // absolutely positioned shell — sits above the map
  return (
    <div className="absolute left-3 top-3 z-[1001]">
      <div className="relative">
        <input
          aria-label="Search place"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q.length >= 3 && setOpen(true)}
          placeholder="Search address or place…"
          className="w-[300px] rounded-md border border-gray-300 bg-white/95 px-3 py-2 text-sm shadow outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {open && items.length > 0 && (
          <div className="absolute mt-1 max-h-72 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
            {items.map((s, i) => (
              <button
                key={i}
                type="button"
                className="block w-full cursor-pointer px-3 py-2 text-left text-[13px] hover:bg-gray-50"
                onClick={() => pick(s)}
              >
                {s.display_name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

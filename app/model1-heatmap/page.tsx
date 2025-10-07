'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';

const Model1HeatmapClient = dynamic<{ onStationsCount?: (n: number) => void }>(() => import('./Model1HeatmapClient'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-600">Loading map...</p>
    </div>
  ),
});

export default function Page() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [markersCount, setMarkersCount] = useState<number>(0);

  async function onGoClick() {
    try {
      const q = inputRef.current?.value?.trim() || '';
      if (!q) return;
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const j = await r.json();
      if (j?.lat && j?.lng) {
        window.dispatchEvent(new CustomEvent('autodun:flyto', { detail: { lat: j.lat, lng: j.lng } }));
      }
    } catch {}
  }

  return (
    <>
      {/* Load Leaflet CSS once */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        crossOrigin=""
      />

      {/* Simple toolbar */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search city or postcode..."
          className="border rounded px-3 py-2 w-80"
        />
        <button type="button" onClick={onGoClick} className="border rounded px-3 py-2">
          Go
        </button>
        <span className="ml-4">Markers ({markersCount})</span>
      </div>

      {/* Map client (handles map, toggles, layers) */}
      <div className="min-h-screen flex flex-col">
        <Model1HeatmapClient onStationsCount={setMarkersCount} />
      </div>
    </>
  );
}

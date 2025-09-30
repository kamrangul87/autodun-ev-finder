'use client';

import { useCallback } from 'react';
import { useMap } from 'react-leaflet';

export default function MapButtons({
  resetCenter,
  resetZoom = 12,
}: {
  resetCenter: [number, number];
  resetZoom?: number;
}) {
  const map = useMap();

  const locate = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.flyTo([latitude, longitude], Math.max(map.getZoom(), 14), { duration: 0.8 });
      },
      () => {
        // ignore errors silently
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 8_000 }
    );
  }, [map]);

  const reset = useCallback(() => {
    map.flyTo(resetCenter, resetZoom, { duration: 0.8 });
  }, [map, resetCenter, resetZoom]);

  return (
    <div className="absolute right-3 bottom-3 z-[1000] flex flex-col gap-2">
      <button
        onClick={locate}
        className="px-3 py-2 rounded-md bg-white/95 shadow hover:bg-white text-sm"
        title="Locate me"
      >
        📍 Locate
      </button>
      <button
        onClick={reset}
        className="px-3 py-2 rounded-md bg-white/95 shadow hover:bg-white text-sm"
        title="Reset view"
      >
        ↺ Reset
      </button>
    </div>
  );
}

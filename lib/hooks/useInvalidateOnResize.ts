'use client';
import { useEffect } from 'react';
import type L from 'leaflet';
export function useInvalidateOnResize(map: L.Map | null) {
  useEffect(() => {
    if (!map) return;
    const invalidate = () => map.invalidateSize();
    const t = setTimeout(invalidate, 50);      // after first paint
    map.once('load', invalidate);
    window.addEventListener('resize', invalidate);
    window.addEventListener('orientationchange', invalidate);
    document.addEventListener('visibilitychange', invalidate);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('orientationchange', invalidate);
      document.removeEventListener('visibilitychange', invalidate);
    };
  }, [map]);
}

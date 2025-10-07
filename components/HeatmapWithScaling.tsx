'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

type HeatPoint = { lat: number; lng: number; value?: number };

type Props = {
  points: HeatPoint[];
  radius?: number; // px
  blur?: number;   // px
  maxZoom?: number;
};

export default function HeatmapWithScaling({
  points,
  radius = 18,
  blur = 15,
  maxZoom = 18,
}: Props) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  // Create layer on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default as any;
      await import('leaflet.heat'); // extends L with heatLayer

      if (cancelled) return;

      const latlngs = (points ?? [])
        .filter(p => typeof p.lat === 'number' && typeof p.lng === 'number')
        .map(p => [p.lat, p.lng, p.value ?? 1]);

      // ✅ if something left the old layer behind, remove it first
      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }

      layerRef.current = L.heatLayer(latlngs, { radius, blur, maxZoom });
      layerRef.current.addTo(map);
    })();

    return () => {
      cancelled = true;
      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
    };
    // mount once; updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update data/options on change
  useEffect(() => {
    if (!layerRef.current) return;

    const latlngs = (points ?? [])
      .filter(p => typeof p.lat === 'number' && typeof p.lng === 'number')
      .map(p => [p.lat, p.lng, p.value ?? 1]);

    try {
      // ✅ try to update in place
      if (typeof layerRef.current.setLatLngs === 'function') {
        layerRef.current.setLatLngs(latlngs);
      } else {
        throw new Error('setLatLngs not available');
      }

      // ✅ setOptions is not guaranteed in leaflet.heat; guard it
      if (typeof layerRef.current.setOptions === 'function') {
        layerRef.current.setOptions({ radius, blur, maxZoom });
      } else {
        // fallback: recreate with new options if options changed materially
        throw new Error('setOptions not available');
      }
    } catch {
      // ✅ safe fallback: recreate the layer with current data + options
      (async () => {
        const L = (await import('leaflet')).default as any;
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = L.heatLayer(latlngs, { radius, blur, maxZoom });
        layerRef.current.addTo(map);
      })();
    }
  }, [points, radius, blur, maxZoom, map]);

  return null;
}

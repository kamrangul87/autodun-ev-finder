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

      const latlngs = points.map(p => [p.lat, p.lng, p.value ?? 1]);
      layerRef.current = L.heatLayer(latlngs, {
        radius,
        blur,
        maxZoom,
      });

      layerRef.current.addTo(map);
    })();

    return () => {
      cancelled = true;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
    // we intentionally mount only once; updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update data/options on change
  useEffect(() => {
    if (!layerRef.current) return;
    const latlngs = points.map(p => [p.lat, p.lng, p.value ?? 1]);
    layerRef.current.setLatLngs(latlngs);
    layerRef.current.setOptions({ radius, blur, maxZoom });
  }, [points, radius, blur, maxZoom]);

  return null;
}

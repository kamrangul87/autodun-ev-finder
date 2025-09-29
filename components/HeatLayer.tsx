'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

type HeatPoint = [number, number, number];
type HeatOptions = {
  radius?: number;
  blur?: number;
  maxZoom?: number;
  max?: number;
  minOpacity?: number;
};

export default function HeatLayer({
  points,
  options,
}: {
  points: HeatPoint[];
  options?: HeatOptions;
}) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default as any;
      await import('leaflet.heat');

      if (cancelled || !map) return;

      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
      if (!points.length) return;

      // stronger defaults
      const layer = (L as any).heatLayer(points, {
        radius: 55,
        blur: 30,
        maxZoom: 17,
        max: 1.0,
        minOpacity: 0.45,
        ...(options || {}),
      });
      layer.addTo(map);
      layerRef.current = layer;
    })();

    return () => {
      cancelled = true;
      if (layerRef.current && map) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
    };
  }, [map, points, options]);

  return null;
}

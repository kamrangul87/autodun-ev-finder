'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

type HeatPoint = [number, number, number];

export type HeatOptions = {
  radius?: number;      // px
  blur?: number;        // px
  max?: number;         // 0..1
  minOpacity?: number;  // 0..1
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

      // remove previous layer if any
      if (layerRef.current) {
        try {
          map.removeLayer(layerRef.current);
        } catch {}
        layerRef.current = null;
      }
      if (!points.length) return;

      // defaults with overrides from options
      const layer = (L as any).heatLayer(points, {
        radius: options?.radius ?? 45,
        blur: options?.blur ?? 25,
        max: options?.max ?? 1.0,
        minOpacity: options?.minOpacity ?? 0.35,
      });

      layer.addTo(map);
      layerRef.current = layer;
    })();

    return () => {
      cancelled = true;
      if (layerRef.current && map) {
        try {
          map.removeLayer(layerRef.current);
        } catch {}
        layerRef.current = null;
      }
    };
  }, [map, points, options?.radius, options?.blur, options?.max, options?.minOpacity]);

  return null;
}

'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

export type HeatPoint = [number, number, number];

export type HeatOptions = {
  radius?: number;
  blur?: number;
  minOpacity?: number;
  /** extras supported by leaflet.heat */
  maxZoom?: number;
  max?: number;
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

      // remove previous layer (if any)
      if (layerRef.current) {
        try {
          map.removeLayer(layerRef.current);
        } catch {}
        layerRef.current = null;
      }
      if (!points?.length) return;

      const layer = (L as any).heatLayer(points, {
        radius: options?.radius ?? 45,
        blur: options?.blur ?? 25,
        minOpacity: options?.minOpacity ?? 0.35,
        maxZoom: options?.maxZoom ?? 17,
        max: options?.max ?? 1.0,
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
  }, [map, points, options?.radius, options?.blur, options?.minOpacity, options?.maxZoom, options?.max]);

  return null;
}

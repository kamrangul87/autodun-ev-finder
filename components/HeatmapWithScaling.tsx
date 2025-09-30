'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

/** Point shape expected by this component */
export type Point = {
  lat: number;
  lng: number;
  value: number; // 0..1 weight
};

export type HeatOptions = {
  radius?: number;     // default 28
  blur?: number;       // default 25
  minOpacity?: number; // default 0.35
  max?: number;        // default 1.0
};

type Props = {
  points: Point[];
  options?: HeatOptions;
};

/**
 * Leaflet heat layer wrapper that accepts points as {lat,lng,value}
 * and optional visual options via `options`.
 */
export default function HeatmapWithScaling({ points, options }: Props) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // load leaflet + plugin only on client
      const L = (await import('leaflet')).default as any;
      await import('leaflet.heat');

      if (cancelled || !map) return;

      // remove old layer if present
      if (layerRef.current) {
        try {
          map.removeLayer(layerRef.current);
        } catch {}
        layerRef.current = null;
      }

      if (!points?.length) return;

      // leaflet.heat expects [lat, lng, intensity] tuples
      const tuples: [number, number, number][] = points.map((p) => [
        Number(p.lat),
        Number(p.lng),
        Math.max(0, Math.min(1, Number(p.value))),
      ]);

      const layer = (L as any).heatLayer(tuples, {
        radius: options?.radius ?? 28,
        blur: options?.blur ?? 25,
        minOpacity: options?.minOpacity ?? 0.35,
        max: options?.max ?? 1.0,
      });

      layer.addTo(map);
      layerRef.current = layer;
    })();

    // cleanup on unmount or props change
    return () => {
      cancelled = true;
      if (layerRef.current && map) {
        try {
          map.removeLayer(layerRef.current);
        } catch {}
        layerRef.current = null;
      }
    };
  }, [map, points, options?.radius, options?.blur, options?.minOpacity, options?.max]);

  return null;
}

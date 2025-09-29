'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

type HeatPoint = [number, number, number];

export type HeatOptions = {
  radius?: number;      // px
  blur?: number;        // px
  max?: number;         // 0..1
  minOpacity?: number;  // 0..1
  /** Custom intensity multiplier we add on top of leaflet.heat */
  boost?: number;       // e.g. 0.5 .. 3
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

      // Remove any previous instance
      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
      if (!points.length) return;

      // Apply optional boost to the weight and clamp to [0,1]
      const boost = options?.boost ?? 1;
      const boosted: HeatPoint[] =
        boost === 1
          ? points
          : points.map(([lat, lon, w]) => [lat, lon, Math.max(0, Math.min(1, w * boost))] as HeatPoint);

      const layer = (L as any).heatLayer(boosted, {
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
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
    };
  // include every option we read so React updates when they change
  }, [
    map,
    points,
    options?.radius,
    options?.blur,
    options?.max,
    options?.minOpacity,
    options?.boost,
  ]);

  return null;
}

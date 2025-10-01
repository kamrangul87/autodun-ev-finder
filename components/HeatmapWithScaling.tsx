'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';

export type HeatPoint = { lat: number; lng: number; value: number };

type Props = {
  points: HeatPoint[];
  intensity?: number; // default 1 (used for debug only here; values should be pre-scaled)
  radius?: number;    // default 18
  blur?: number;      // default 15 (leaflet.heat uses pixel blur)
};

export default function HeatmapWithScaling({ points, intensity = 1, radius = 18, blur = 15 }: Props) {
  const map = useMap();
  const layerRef = useRef<any | null>(null);

  const safe = useMemo(
    () =>
      (Array.isArray(points) ? points : [])
        .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.value))
        .slice(0, 20000),
    [points]
  );

  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      try {
        // Lazy-load leaflet.heat plugin on client
        await import('leaflet.heat');
        // eslint-disable-next-line no-console
        console.debug('[Heatmap] points:', safe.length, 'radius:', radius, 'blur:', blur);
        const L = (window as any).L;
        // eslint-disable-next-line no-console
        console.debug('[Heatmap] L.heatLayer available:', !!L?.heatLayer);
        if (!L?.heatLayer) {
          // eslint-disable-next-line no-console
          console.warn('[Heatmap] leaflet.heat not available after import; skipping layer');
          return;
        }

        const pts = safe.map((p) => [p.lat, p.lng, Math.max(0.5, p.value)] as [number, number, number]);

        // Remove previous layer
        if (layerRef.current) {
          try { layerRef.current.remove(); } catch {}
          layerRef.current = null;
        }

        if (cancelled || !map) return;
        const layer = L.heatLayer(pts, { radius: Math.max(1, Math.round(radius)), blur: Math.max(0, Math.round(blur)) });
        layer.addTo(map);
        layerRef.current = layer;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[Heatmap] failed to initialize heat layer', e);
      }
    };

    setup();
    return () => {
      cancelled = true;
      if (layerRef.current) {
        try { layerRef.current.remove(); } catch {}
        layerRef.current = null;
      }
    };
  }, [map, safe, radius, blur]);

  return null;
}

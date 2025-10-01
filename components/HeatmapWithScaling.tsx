'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';

export type HeatPoint = { lat: number; lng: number; value: number };

type Props = {
  points: HeatPoint[];
  intensity?: number; // default 1 (debug only; values pre-scaled)
  radius?: number;    // default 18
  blur?: number;      // default 15
};

export default function HeatmapWithScaling({
  points,
  intensity = 1,
  radius = 18,
  blur = 15,
}: Props) {
  const map = useMap();
  const layerRef = useRef<any | null>(null);

  // Validate points and cap to 20k
  const safe = useMemo(
    () =>
      (Array.isArray(points) ? points : [])
        .filter(
          (p) =>
            p &&
            Number.isFinite(p.lat) &&
            Number.isFinite(p.lng) &&
            Number.isFinite(p.value)
        )
        .slice(0, 20000),
    [points]
  );

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      try {
        // Ensure Leaflet is on window
        const Lmod = await import('leaflet');
        if (!(window as any).L) (window as any).L = Lmod;
        const L = (window as any).L;

        // Load plugin
        await import('leaflet.heat');

        // Debug instrumentation
        console.debug(
          '[Heatmap] plugin ready=',
          !!L?.heatLayer,
          'points=',
          safe.length
        );

        if (!L?.heatLayer) {
          console.warn('[Heatmap] leaflet.heat not available; skipping layer');
          return;
        }

        if (cancelled || !map) return;

        // Ensure pane exists
        if (!map.getPane('heatmap')) {
          map.createPane('heatmap');
          map.getPane('heatmap')!.style.zIndex = '450';
        }

        // Remove old layer
        if (layerRef.current) {
          try {
            map.removeLayer(layerRef.current);
          } catch {}
          layerRef.current = null;
        }

        // Convert to [lat, lng, weight]
        const pts = safe.map(
          (p) => [p.lat, p.lng, Math.max(0.5, p.value * intensity)] as [
            number,
            number,
            number
          ]
        );

        console.debug(
          `[ClientMap] stations=${points.length} heatPoints=${pts.length}`
        );

        // Create heat layer
        const layer = L.heatLayer(pts, {
          radius: Math.max(1, Math.round(radius)),
          blur: Math.max(0, Math.round(blur)),
          pane: 'heatmap',
        });

        layer.addTo(map);
        layerRef.current = layer;
      } catch (e) {
        console.warn('[Heatmap] failed to init heat layer', e);
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (layerRef.current) {
        try {
          map.removeLayer(layerRef.current);
        } catch {}
        layerRef.current = null;
      }
    };
  }, [map, safe, radius, blur, intensity, points.length]);

  return null;
}

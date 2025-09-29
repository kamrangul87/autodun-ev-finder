// components/HeatLayer.tsx
'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

type HeatPoint = [number, number, number];

export default function HeatLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    if (!map) return;

    // pane sits between council (300) and markers (default overlay ~400)
    if (!map.getPane('heatmap-pane')) {
      const p = map.createPane('heatmap-pane');
      p.style.zIndex = '350';
    }

    (async () => {
      const L = (await import('leaflet')).default as any;
      await import('leaflet.heat');

      // clear old layer
      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
      if (!points.length) return;

      // stronger defaults so it’s visible at city zoom
      const layer = (L as any).heatLayer(points, {
        pane: 'heatmap-pane',
        radius: 32,
        blur: 20,
        maxZoom: 18,
        max: 1.0,
        minOpacity: 0.45,
      });
      layer.addTo(map);
      layerRef.current = layer;
    })();

    return () => {
      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
    };
  }, [map, points]);

  return null;
}

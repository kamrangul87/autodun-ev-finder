'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

type HeatPoint = [number, number, number];

export default function HeatLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    if (!map) return;

    // Pane between council (z=300) and markers (≈400)
    if (!map.getPane('heatmap-pane')) {
      const p = map.createPane('heatmap-pane');
      p.style.zIndex = '350';
    }

    (async () => {
      const L = (await import('leaflet')).default as any;
      await import('leaflet.heat');

      // remove existing layer
      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
      if (!points?.length) {
        console.log('[heat] no points');
        return;
      }

      console.log('[heat] adding layer, points=', points.length);
      const layer = (L as any).heatLayer(points, {
        pane: 'heatmap-pane',
        // stronger, very obvious defaults so you SEE it
        radius: 36,
        blur: 20,
        max: 1.0,
        minOpacity: 0.55,
        maxZoom: 19,
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

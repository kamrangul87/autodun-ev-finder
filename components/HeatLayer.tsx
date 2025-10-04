'use client';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

type Props = { points: [number, number, number][] };

export default function HeatLayer({ points }: Props) {
  const map = useMap();

  useEffect(() => {
    let layer: any | null = null;
    let cancelled = false;

    (async () => {
      // Load the plugin only in the browser to avoid SSR issues
      await import('leaflet.heat');

      const HF = (L as any)?.heatLayer as ((pts:any[], opts?:any)=>any) | undefined;
      if (!map || !HF || cancelled) return;

      layer = HF(points, {
        radius: 30,
        blur: 22,
        maxZoom: 18,
        max: 1,
        minOpacity: 0.35,
      });
      layer.addTo(map);
    })();

    return () => {
      cancelled = true;
      try { layer && layer.remove(); } catch {}
    };
  }, [map, JSON.stringify(points)]);

  return null;
}

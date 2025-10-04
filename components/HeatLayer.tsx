'use client';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

type Props = { points: [number, number, number][] };

export default function HeatLayer({ points }: Props) {
  const map = useMap();

  useEffect(() => {
    if (!map) return undefined;

    let layer: any | null = null;
    let cancelled = false;

    import('leaflet.heat')
      .then(() => {
        if (cancelled) return;
        const heatFactory = (L as any)?.heatLayer as ((pts: any[], opts?: any) => any) | undefined;
        if (!heatFactory) return;

        layer = heatFactory(points, {
          radius: 30,
          blur: 22,
          maxZoom: 18,
          max: 1,
          minOpacity: 0.35,
        });
        layer.addTo(map);
      })
      .catch(() => {
        // Ignore load errors; the map renders without the heat layer.
      });

    return () => {
      cancelled = true;
      if (layer) {
        try {
          layer.remove();
        } catch {
          // Ignore teardown errors from Leaflet.
        }
      }
    };
  }, [map, points]);

  return null;
}

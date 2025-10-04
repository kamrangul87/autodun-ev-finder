'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

type Props = { url?: string };

export default function CouncilLayer({ url = '/data/councils.sample.geojson' }: Props) {
  const map = useMap();

  useEffect(() => {
    let layer: any = null;
    let cancelled = false;

    (async () => {
      try {
        const L = (await import('leaflet')).default;
        if (typeof window !== 'undefined') {
          await import('leaflet/dist/leaflet.css');
        }

        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) return;
        const gj = await r.json();
        if (cancelled) return;

        layer = L.geoJSON(gj, {
          style: {
            color: '#1976d2',
            weight: 2,
            fillColor: '#2196f3',
            fillOpacity: 0.2,
          },
        }).addTo(map);
      } catch (err) {
        console.error('CouncilLayer error:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map, url]);

  return null;
}

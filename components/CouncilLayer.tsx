'use client';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

type Props = {
  /** Optional path/URL to a GeoJSON file. Defaults to bundled sample. */
  url?: string;
};

export default function CouncilLayer({ url = '/data/councils.sample.geojson' }: Props) {
  const map = useMap();

  useEffect(() => {
    let layer: L.GeoJSON<any> | null = null;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return;
        const gj = await res.json();
        if (cancelled) return;

        layer = L.geoJSON(gj, {
          style: { color: '#1976d2', weight: 2, fillColor: '#2196f3', fillOpacity: 0.2 },
          onEachFeature(_f, l) {
            l.bindTooltip(
              (typeof _f?.properties?.name === 'string' ? _f.properties.name : 'Council Area'),
              { sticky: true }
            );
          },
        }).addTo(map);
      } catch {
        // silent fallback (no polygons)
      }
    })();

    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map, url]);

  return null;
}

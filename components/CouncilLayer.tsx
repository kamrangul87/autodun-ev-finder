'use client';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export default function CouncilLayer(){
  const map = useMap();
  useEffect(() => {
    let layer: L.GeoJSON<any> | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/data/councils.sample.geojson', { cache:'no-store' });
        const gj = await res.json();
        if (cancelled) return;
        layer = L.geoJSON(gj, {
          style: { color:'#1976d2', weight:2, fillColor:'#2196f3', fillOpacity:0.2 }
        }).addTo(map);
      } catch {}
    })();
    return () => { cancelled = true; if (layer) map.removeLayer(layer); };
  }, [map]);
  return null;
}

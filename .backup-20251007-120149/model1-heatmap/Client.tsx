'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Load Leaflet CSS only in browser
if (typeof window !== 'undefined') {
  import('leaflet/dist/leaflet.css');
}

// Dynamically import react-leaflet (no SSR)
const MapContainer = dynamic(
  () => import('react-leaflet').then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((m) => m.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((m) => m.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((m) => m.Popup),
  { ssr: false }
);
import { useMap } from 'react-leaflet';

import CouncilLayer from '../../components/CouncilLayer';
import SearchControl from '../../components/SearchControl';

type HeatPoint = [number, number, number?];
type Station = {
  id: string | number;
  lat: number;
  lng: number;
  name?: string;
  address?: string;
  postcode?: string;
  connectors?: number;
};

const LONDON_CENTER: [number, number] = [51.5074, -0.1278];

function HeatLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const L = (await import('leaflet')).default as any;
      await import('leaflet.heat');
      if (!mounted) return;

      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      if (!points.length) return;

      layerRef.current = L.heatLayer(points, { radius: 20, blur: 12, maxZoom: 17 });
      layerRef.current.addTo(map);
    })();

    return () => {
      mounted = false;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points]);

  return null;
}

export default function Client() {
  const [stations, setStations] = useState<Station[]>([]);
  const [showHeat, setShowHeat] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showPolys, setShowPolys] = useState(false);

  // Fix default marker icons (browser only)
  useEffect(() => {
    (async () => {
      const L = (await import('leaflet')).default as any;
      const [retina, icon, shadow] = await Promise.all([
        import('leaflet/dist/images/marker-icon-2x.png'),
        import('leaflet/dist/images/marker-icon.png'),
        import('leaflet/dist/images/marker-shadow.png'),
      ]);
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: (retina as any).default ?? retina,
        iconUrl: (icon as any).default ?? icon,
        shadowUrl: (shadow as any).default ?? shadow,
      });
    })();
  }, []);

  // Fetch stations client-side
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/stations?source=ocm&lat=51.5074&lon=-0.1278&dist=15', { cache: 'no-store' });
        const j = await r.json();
        const items: Station[] = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
        if (!cancelled) setStations(items);
      } catch {
        if (!cancelled) setStations([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const heatPoints: HeatPoint[] = useMemo(
    () => stations.map((s) => [s.lat, s.lng, 0.7]),
    [stations]
  );

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <div style={{
        position: 'absolute', zIndex: 1000, left: 12, top: 12,
        display: 'flex', gap: 12, background: 'white', padding: '6px 10px',
        borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        <label><input type="checkbox" checked={showHeat} onChange={e => setShowHeat(e.target.checked)} /> Heatmap</label>
        <label><input type="checkbox" checked={showMarkers} onChange={e => setShowMarkers(e.target.checked)} /> Markers</label>
        <label><input type="checkbox" checked={showPolys} onChange={e => setShowPolys(e.target.checked)} /> Polygons</label>
      </div>

      <MapContainer center={LONDON_CENTER} zoom={11} style={{ width: '100%', height: '100%' }}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {showHeat && <HeatLayer points={heatPoints} />}

        {showMarkers && stations.map((s) => (
          <Marker key={String(s.id)} position={[s.lat, s.lng] as any}>
            <Popup>
              <div style={{ minWidth: 220 }}>
                <strong>{s.name ?? 'EV Charger'}</strong><br />
                {s.address && <>{s.address}<br /></>}
                {s.postcode && <>{s.postcode}<br /></>}
                {typeof s.connectors === 'number' && <>Connectors: {s.connectors}<br /></>}
              </div>
            </Popup>
          </Marker>
        ))}

        {showPolys && <CouncilLayer url="/data/councils.sample.geojson" />}
        <SearchControl />
      </MapContainer>
    </div>
  );
}

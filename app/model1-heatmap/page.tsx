'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamicImport from 'next/dynamic';

// Load Leaflet CSS only in the browser
if (typeof window !== 'undefined') {
  import('leaflet/dist/leaflet.css');
}

// Lazy-load every react-leaflet piece (prevents server import)
const MapContainer = dynamicImport(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer     = dynamicImport(() => import('react-leaflet').then(m => m.TileLayer),     { ssr: false });
const Marker        = dynamicImport(() => import('react-leaflet').then(m => m.Marker),        { ssr: false });
const Popup         = dynamicImport(() => import('react-leaflet').then(m => m.Popup),         { ssr: false });
const useMapHook: any = dynamicImport(() => import('react-leaflet').then(m => m.useMap),      { ssr: false });

// Capture map instance without server import
function CaptureMapRef({ onMap }: { onMap: (m: any) => void }) {
  const map = useMapHook();
  useEffect(() => { onMap(map); }, [map, onMap]);
  return null;
}

// Heat layer using leaflet + leaflet.heat loaded at runtime
function HeatLayer({ points }: { points: [number, number, number?][] }) {
  const map = useMapHook();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const L = (await import('leaflet')).default as any;
      await import('leaflet.heat');
      if (!mounted) return;

      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
      if (!points.length) return;

      const layer = L.heatLayer(points, { radius: 20, blur: 12, maxZoom: 17, minOpacity: 0.35 });
      layer.addTo(map);
      layerRef.current = layer;
    })();

    return () => {
      mounted = false;
      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
    };
  }, [map, points]);

  return null;
}

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

export default function Page() {
  const [stations, setStations] = useState<Station[]>([]);
  const [showHeat, setShowHeat] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const mapRef = useRef<any>(null);

  // fix default marker icons
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/stations?lat=51.5074&lon=-0.1278&dist=15', { cache: 'no-store' });
        const j = await res.json();
        const items: Station[] = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
        if (!cancelled) setStations(items);
      } catch { if (!cancelled) setStations([]); }
    })();
    return () => { cancelled = true; };
  }, []);

  const heatPoints = useMemo<[number, number, number?][]>(() =>
    stations.map(s => [s.lat, s.lng, 0.7]), [stations]);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <div style={{
        position: 'absolute', zIndex: 1000, left: 12, top: 12, display: 'flex',
        gap: 12, background: 'white', padding: '6px 10px', borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        <label><input type="checkbox" checked={showHeat} onChange={e => setShowHeat(e.target.checked)} /> Heatmap</label>
        <label><input type="checkbox" checked={showMarkers} onChange={e => setShowMarkers(e.target.checked)} /> Markers</label>
      </div>

      <MapContainer center={LONDON_CENTER} zoom={12} style={{ width: '100%', height: '100%' }}>
        <CaptureMapRef onMap={(m) => { mapRef.current = m; }} />
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {showHeat && <HeatLayer points={heatPoints} />}

        {showMarkers && stations.map(s => (
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
      </MapContainer>
    </div>
  );
}

'use client';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import '../../lib/leaflet-setup'; // 👈 relative path (no @ alias)

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker       = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup        = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });
const ZoomControl  = dynamic(() => import('react-leaflet').then(m => m.ZoomControl), { ssr: false });

import { useMap } from 'react-leaflet';

const HeatLayer    = dynamic(() => import('../../components/HeatLayer'), { ssr: false });     // 👈 relative
const CouncilLayer = dynamic(() => import('../../components/CouncilLayer'), { ssr: false });  // 👈 relative
const SearchBox    = dynamic(() => import('../../components/SearchBox'), { ssr: false });     // 👈 relative

type Station = {
  id: string | number;
  lat: number;
  lng: number;
  name?: string;
  address?: string;
  postcode?: string;
  connectors?: number;
  source?: string;
};

function Controls({
  heat, setHeat, markers, setMarkers, polys, setPolys,
}: {
  heat:boolean; setHeat:(v:boolean)=>void;
  markers:boolean; setMarkers:(v:boolean)=>void;
  polys:boolean; setPolys:(v:boolean)=>void;
}) {
  return (
    <div style={{
      position:'absolute', top:12, left:12, zIndex:1000,
      background:'white', padding:8, borderRadius:8,
      boxShadow:'0 2px 10px rgba(0,0,0,0.15)'
    }}>
      <label style={{ marginRight:12 }}>
        <input type="checkbox" checked={heat} onChange={e=>setHeat(e.target.checked)} /> Heatmap
      </label>
      <label style={{ marginRight:12 }}>
        <input type="checkbox" checked={markers} onChange={e=>setMarkers(e.target.checked)} /> Markers
      </label>
      <label>
        <input type="checkbox" checked={polys} onChange={e=>setPolys(e.target.checked)} /> Polygons
      </label>
    </div>
  );
}

function CaptureMap({ onReady }: { onReady: (m: any) => void }) {
  const map = useMap();
  useEffect(() => { if (map) onReady(map); }, [map, onReady]);
  return null;
}

// Merge POIs that share nearly the same coordinate (~11m at this lat)
function dedupeStations(items: Station[]) {
  const byKey = new Map<string, Station & { _count: number }>();
  for (const s of items) {
    const key = `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, { ...s, connectors: s.connectors ?? 1, _count: 1 });
    else { prev.connectors = (prev.connectors ?? 0) + (s.connectors ?? 1); prev._count += 1; }
  }
  return [...byKey.values()];
}

export default function Page() {
  const [items, setItems] = useState<Station[]>([]);
  const [heatOn, setHeatOn] = useState(true);
  const [markersOn, setMarkersOn] = useState(true);
  const [polysOn, setPolysOn] = useState(false);
  const [map, setMap] = useState<any>(null);

  // Load ALL of London once (not per-viewport)
  const fetchAllLondon = useCallback(async () => {
    try {
      // London bbox → backend returns all stations in one response
      const qs = '?north=51.6919&south=51.2867&east=0.3340&west=-0.5104';
      const r = await fetch('/api/stations' + qs, { cache: 'no-store' });
      const d = await r.json();
      setItems(Array.isArray(d.items) ? d.items : []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => { fetchAllLondon(); }, [fetchAllLondon]);

  const grouped = useMemo(() => dedupeStations(items), [items]);
  const heatPoints = useMemo(
    () => grouped.map(s => [s.lat, s.lng, Math.min(1, (s.connectors || 1) / 10)] as [number, number, number]),
    [grouped]
  );

  return (
    <div style={{ height:'100%', width:'100%', position:'relative' }}>
      <SearchBox map={map} />
      <Controls
        heat={heatOn} setHeat={setHeatOn}
        markers={markersOn} setMarkers={setMarkersOn}
        polys={polysOn} setPolys={setPolysOn}
      />

      <div style={{
        position:'absolute', top:12, right:12, zIndex:1000,
        background:'white', padding:'6px 10px', borderRadius:8,
        boxShadow:'0 2px 10px rgba(0,0,0,0.15)'
      }}>
        stations: {items.length}
      </div>

      <MapContainer
        center={[51.5074, -0.1278]}
        zoom={11}
        style={{ height:'100vh', width:'100%' }}
        preferCanvas
        zoomControl={false}   // we add our own control at bottom-right
      >
        <CaptureMap onReady={setMap} />
        <ZoomControl position="bottomright" />

        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {heatOn  && <HeatLayer points={heatPoints} />}
        {polysOn && <CouncilLayer />}

        {markersOn && grouped.map((s: any) => (
          <Marker key={`${s.lat},${s.lng}`} position={[s.lat, s.lng]}>
            <Popup>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 600 }}>{s.name || 'EV Station'}</div>
                {s.address && <div>{s.address}</div>}
                {s.postcode && <div>{s.postcode}</div>}
                {s._count > 1 && <div>Sites merged: {s._count}</div>}
                {s.connectors != null && <div>Connectors: {s.connectors}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

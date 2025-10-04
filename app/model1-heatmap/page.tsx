'use client';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import '@/lib/leaflet-setup';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker       = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup        = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });
const ZoomControl  = dynamic(() => import('react-leaflet').then(m => m.ZoomControl), { ssr: false });

import { useMap } from 'react-leaflet';

const HeatLayer    = dynamic(() => import('@/components/HeatLayer'), { ssr: false });
const CouncilLayer = dynamic(() => import('@/components/CouncilLayer'), { ssr: false });
const SearchBox    = dynamic(() => import('@/components/SearchBox'), { ssr: false });

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

/** Captures the Leaflet map instance once this component mounts inside <MapContainer>. */
function CaptureMap({ onReady }: { onReady: (m: any) => void }) {
  const map = useMap();
  const report = useCallback(() => { if (map) onReady(map); }, [map, onReady]);
  React.useEffect(() => { report(); }, [report]);
  return null;
}

/** Merge POIs that share (roughly) the same location; sum connectors and keep a count. */
function dedupeStations(items: Station[]) {
  const byKey = new Map<string, Station & { _count: number }>();
  for (const s of items) {
    const key = `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`; // ~11m at this latitude
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...s, connectors: s.connectors ?? 1, _count: 1 });
    } else {
      prev.connectors = (prev.connectors ?? 0) + (s.connectors ?? 1);
      prev._count += 1;
      // keep the first name/address; we could also suffix “(+N)”
    }
  }
  return [...byKey.values()];
}

export default function Page() {
  const [items, setItems] = useState<Station[]>([]);
  const [heatOn, setHeatOn] = useState(true);
  const [markersOn, setMarkersOn] = useState(true);
  const [polysOn, setPolysOn] = useState(false);
  const [feedbackTick, setFeedbackTick] = useState(0);

  const [map, setMap] = useState<any>(null);
  const [zoom, setZoom] = useState(11);

  // Fetch stations (optionally with bbox)
  const fetchStations = useCallback(async (bbox?: {n:number;s:number;e:number;w:number}) => {
    try {
      const qs = bbox
        ? `?north=${bbox.n}&south=${bbox.s}&east=${bbox.e}&west=${bbox.w}`
        : '';
      const res = await fetch(`/api/stations${qs}`, { cache: 'no-store' });
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchStations(); }, [fetchStations, feedbackTick]);

  // Refetch on pan/zoom with current bbox (works with OCM)
  useEffect(() => {
    if (!map) return;
    let t: any;
    const update = () => {
      const b = map.getBounds();
      const z = map.getZoom();
      setZoom(z);
      const bbox = { n: b.getNorth(), s: b.getSouth(), e: b.getEast(), w: b.getWest() };
      clearTimeout(t);
      t = setTimeout(() => fetchStations(bbox), 150);
    };
    update();
    map.on('moveend', update);
    map.on('zoomend', update);
    return () => {
      map.off('moveend', update);
      map.off('zoomend', update);
      clearTimeout(t);
    };
  }, [map, fetchStations]);

  // Deduped points for both markers and heat (makes intensity more realistic)
  const grouped = useMemo(() => dedupeStations(items), [items]);

  const heatPoints = useMemo(
    () => grouped.map(s => [s.lat, s.lng, Math.min(1, (s.connectors || 1) / 10)] as [number, number, number]),
    [grouped]
  );

  const onQuickFeedback = async (stationId: string|number) => {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ stationId, rating: 0 })
      });
      setFeedbackTick(x => x + 1);
    } catch { /* ignore */ }
  };

  // Only render markers when zoomed in to reduce clutter
  const canShowMarkers = markersOn && (zoom >= 12 || grouped.length <= 120);

  return (
    <div style={{ height:'100%', width:'100%', position:'relative' }}>
      {/* Search overlay (center top) */}
      <SearchBox map={map} />

      {/* Our toggles (top-left) */}
      <Controls
        heat={heatOn} setHeat={setHeatOn}
        markers={markersOn} setMarkers={setMarkersOn}
        polys={polysOn} setPolys={setPolysOn}
      />

      {/* Station count pill (top-right) */}
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
        zoomControl={false}  // keep default zoom off; add our own bottom-right
      >
        <CaptureMap onReady={setMap} />
        <ZoomControl position="bottomright" />

        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {heatOn  && <HeatLayer points={heatPoints} />}
        {polysOn && <CouncilLayer />}

        {canShowMarkers && grouped.map((s:any) => (
          <Marker key={`${s.lat},${s.lng}`} position={[s.lat, s.lng]}>
            <Popup>
              <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 600 }}>
                  {s.name || 'EV Station'}
                </div>
                {s.address && <div>{s.address}</div>}
                {s.postcode && <div>{s.postcode}</div>}
                {s._count > 1 && <div>Sites merged: {s._count}</div>}
                {s.connectors != null && <div>Connectors: {s.connectors}</div>}
                <button
                  onClick={() => onQuickFeedback(s.id)}
                  style={{
                    marginTop: 8, background:'#ff7a00', color:'white',
                    border:'none', padding:'6px 10px', borderRadius:6, cursor:'pointer'
                  }}
                >
                  Quick Feedback
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

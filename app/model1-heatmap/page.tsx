'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import '@/lib/leaflet-setup'; // ensure marker icons work

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });


const HeatLayer = dynamic(() => import('@/components/HeatLayer'), { ssr: false });
const CouncilLayer = dynamic(() => import('@/components/CouncilLayer'), { ssr: false });
const SearchBox = dynamic(() => import('@/components/SearchBox'), { ssr: false });

type Station = { id: string|number; lat: number; lng: number; name?: string; address?: string; postcode?: string; connectors?: number; source?: string; };

function Controls({heat, setHeat, markers, setMarkers, polys, setPolys}:{heat:boolean; setHeat:(v:boolean)=>void; markers:boolean; setMarkers:(v:boolean)=>void; polys:boolean; setPolys:(v:boolean)=>void;}){
  return (
    <div style={{ position:'absolute', top:12, left:12, zIndex:1000, background:'white', padding:8, borderRadius:8, boxShadow:'0 2px 10px rgba(0,0,0,0.15)' }}>
      <label style={{ marginRight:12 }}><input type="checkbox" checked={heat} onChange={e=>setHeat(e.target.checked)} /> Heatmap</label>
      <label style={{ marginRight:12 }}><input type="checkbox" checked={markers} onChange={e=>setMarkers(e.target.checked)} /> Markers</label>
      <label><input type="checkbox" checked={polys} onChange={e=>setPolys(e.target.checked)} /> Polygons</label>
    </div>
  );
}

export default function Page(){
  const [items, setItems] = useState<Station[]>([]);
  const [heatOn, setHeatOn] = useState(true);
  const [markersOn, setMarkersOn] = useState(true);
  const [polysOn, setPolysOn] = useState(false);
  const [feedbackTick, setFeedbackTick] = useState(0);

  useEffect(() => {
    fetch('/api/stations', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d.items) ? d.items : []))
      .catch(() => setItems([]));
  }, [feedbackTick]);

  const heatPoints = useMemo(() => items.map(s => [s.lat, s.lng, Math.min(1, (s.connectors||1)/8)] as [number,number,number]), [items]);

  const onQuickFeedback = async (stationId: string|number) => {
    try {
      await fetch('/api/feedback', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ stationId, rating: 0 }) });
      setFeedbackTick(x=>x+1);
    } catch {}
  };

  return (
    <div style={{ height:'100%', width:'100%', position:'relative' }}>
      <SearchBox />
      <Controls heat={heatOn} setHeat={setHeatOn} markers={markersOn} setMarkers={setMarkersOn} polys={polysOn} setPolys={setPolysOn} />
      <div style={{ position:'absolute', top:12, right:12, zIndex:1000, background:'white', padding:'6px 10px', borderRadius:8, boxShadow:'0 2px 10px rgba(0,0,0,0.15)' }}>
        stations: {items.length}
      </div>
      <MapContainer center={[51.5074, -0.1278]} zoom={11} style={{ height:'100vh', width:'100%' }} preferCanvas>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        {heatOn && <HeatLayer points={heatPoints} />}
        {polysOn && <CouncilLayer />}
        {markersOn && items.map(s => (
          <Marker key={String(s.id)} position={[s.lat, s.lng]}>
            <Popup>
              <div style={{ minWidth: 200 }}>
                <div style={{ fontWeight:600 }}>{s.name || 'EV Station'}</div>
                {s.address && <div>{s.address}</div>}
                {s.postcode && <div>{s.postcode}</div>}
                {s.connectors!=null && <div>Connectors: {s.connectors}</div>}
                <button onClick={()=>onQuickFeedback(s.id)} style={{ marginTop:8, background:'#ff7a00', color:'white', border:'none', padding:'6px 10px', borderRadius:6, cursor:'pointer' }}>
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

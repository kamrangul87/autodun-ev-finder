'use client';

import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon, Map as LeafletMap } from 'leaflet';
import dynamic from 'next/dynamic';

const CouncilLayer = dynamic(() => import('@/components/Map/CouncilLayer'), { ssr: false });

interface Station {
  id: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  connectors?: number;
}

const stationIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MapInit({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
    setTimeout(() => map.invalidateSize(), 100);
  }, [map, onReady]);
  return null;
}

export default function Model1HeatmapClient() {
  const [stations, setStations] = useState<Station[]>([]);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCouncil, setShowCouncil] = useState(false);
  const [mounted, setMounted] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    fetch('/api/stations?bbox=-0.5,51.3,0.3,51.7')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => {
        const items = data.stations || data.items || [];
        if (items.length) setStations(items);
      })
      .catch(err => console.warn('Stations fetch failed:', err));
  }, [mounted]);

  if (!mounted) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', zIndex: 50, position: 'relative' }}>
        <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <a href="/" style={{ fontWeight: 'bold', fontSize: '18px' }}>⚡ autodun</a>
          <input 
            type="text" 
            placeholder="Search city or postcode..." 
            style={{ flex: '1 1 auto', maxWidth: '320px', padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px' }}
          />
          <button style={{ padding: '6px 12px', background: '#2563eb', color: 'white', fontSize: '14px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
            Go
          </button>
        </div>
        <div style={{ padding: '0 16px 8px', display: 'flex', gap: '16px', fontSize: '14px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={showHeatmap} onChange={() => setShowHeatmap(v => !v)} />
            🔥 Heatmap
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={showMarkers} onChange={() => setShowMarkers(v => !v)} />
            📍 Markers
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={showCouncil} onChange={() => setShowCouncil(v => !v)} />
            🗺️ Council
          </label>
        </div>
      </div>

      <div style={{ flex: '1 1 auto', position: 'relative', minHeight: 0 }}>
        <MapContainer
          center={[51.5074, -0.1278]}
          zoom={11}
          style={{ width: '100%', height: '100%' }}
          zoomControl={true}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <MapInit onReady={m => { mapRef.current = m; }} />
          {showCouncil && <CouncilLayer visible={true} />}
          {showMarkers && stations
            .filter(s => s.latitude && s.longitude && !isNaN(s.latitude) && !isNaN(s.longitude))
            .map(station => (
              <Marker key={station.id} position={[station.latitude, station.longitude]} icon={stationIcon}>
                <Popup>
                  <div style={{ minWidth: '200px' }}>
                    <h3 style={{ fontWeight: 'bold' }}>{station.name || 'Charging Station'}</h3>
                    {station.address && <p style={{ fontSize: '14px', marginTop: '4px' }}>{station.address}</p>}
                    {station.connectors && <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{station.connectors} connector(s)</p>}
                  </div>
                </Popup>
              </Marker>
            ))}
        </MapContainer>
      </div>
    </div>
  );
}

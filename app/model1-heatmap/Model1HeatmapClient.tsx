'use client';

import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon, Map as LeafletMap } from 'leaflet';
import dynamic from 'next/dynamic';

// Guard SSR: council layer loaded client-only
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

// Keep MapContainer mounted; control layers via refs
function MapInit({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap();
  
  useEffect(() => {
    console.log('[MapInit] MapContainer mounted');
    onReady(map);
    // Fix: invalidate size after mount to handle flex parent
    requestAnimationFrame(() => {
      map.invalidateSize();
      console.log('[MapInit] Size invalidated');
    });
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

  useEffect(() => {
    setMounted(true);
    console.log('[Client] Component mounted');
  }, []);

  // Fetch stations once; keep previous on error (stale-while-revalidate)
  useEffect(() => {
    if (!mounted) return;
    
    console.log('[Fetch] Fetching stations...');
    fetch('/api/stations?bbox=-0.5,51.3,0.3,51.7')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        const items = data.stations || data.items || [];
        console.log('[Fetch] Success:', items.length, 'stations');
        if (items.length) setStations(items);
      })
      .catch(err => {
        console.warn('[Fetch] Failed, keeping previous:', err);
      });
  }, [mounted]);

  if (!mounted) {
    return <div className="flex items-center justify-center flex-1 text-gray-600">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header - normal flow, z-index keeps it above map */}
      <div className="bg-white shadow-sm z-50 relative">
        <div className="px-4 py-2 flex items-center gap-4 flex-wrap">
          <a href="/" className="font-bold text-lg">⚡ autodun</a>
          <input 
            type="text" 
            placeholder="Search city or postcode..." 
            className="flex-1 max-w-xs px-3 py-1.5 border rounded text-sm"
          />
          <button className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
            Go
          </button>
        </div>
        <div className="px-4 pb-2 flex gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showHeatmap} 
              onChange={() => {
                console.log('[Toggle] Heatmap:', !showHeatmap);
                setShowHeatmap(v => !v);
              }} 
            />
            🔥 Heatmap
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showMarkers} 
              onChange={() => {
                console.log('[Toggle] Markers:', !showMarkers);
                setShowMarkers(v => !v);
              }} 
            />
            📍 Markers
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showCouncil} 
              onChange={() => {
                console.log('[Toggle] Council:', !showCouncil);
                setShowCouncil(v => !v);
              }} 
            />
            🗺️ Council
          </label>
        </div>
      </div>

      {/* Map region - inherits height via flex:1 (no fixed sizes) */}
      <div className="flex-1 relative">
        <MapContainer
          center={[51.5074, -0.1278]}
          zoom={11}
          className="h-full w-full"
          zoomControl={true}
          scrollWheelZoom={true}
        >
          {/* Base tiles always present - never conditionally rendered */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
            eventHandlers={{
              tileerror: (e) => {
                console.warn('[TileLayer] Tile error:', e);
              }
            }}
          />
          
          <MapInit onReady={(m) => { 
            mapRef.current = m; 
            console.log('[MapInit] Map ready');
          }} />
          
          {/* Council layer - toggled via visibility prop (no remount) */}
          {showCouncil && <CouncilLayer visible={true} />}
          
          {/* Markers - conditionally rendered but MapContainer stays mounted */}
          {showMarkers && stations
            .filter(s => s.latitude && s.longitude && !isNaN(s.latitude) && !isNaN(s.longitude))
            .map(station => (
              <Marker 
                key={station.id} 
                position={[station.latitude, station.longitude]} 
                icon={stationIcon}
              >
                <Popup>
                  <div className="min-w-[200px]">
                    <h3 className="font-bold">{station.name || 'Charging Station'}</h3>
                    {station.address && <p className="text-sm mt-1">{station.address}</p>}
                    {station.connectors && (
                      <p className="text-xs text-gray-600 mt-1">{station.connectors} connector(s)</p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
        </MapContainer>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon, Map as LeafletMap } from 'leaflet';
import dynamic from 'next/dynamic';
import FloatingControls from '@/components/Map/Controls/FloatingControls';
import StationPopup from '@/components/Map/Popup/StationPopup';

const CouncilLayer = dynamic(() => import('@/components/Map/CouncilLayer'), { ssr: false });

const stationIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Station {
  id: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  postcode?: string;
  connectors?: number;
  powerKW?: number;
  operator?: string;
  connectorTypes?: string[];
}

function MapController({ onReady }: { onReady: (map: LeafletMap) => void }) {
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => setMounted(true), []);

  // Fetch stations once, keep on error (stale-while-revalidate)
  useEffect(() => {
    if (!mounted) return;
    fetch('/api/stations?bbox=-0.5,51.3,0.3,51.7')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => {
        const items = data.stations || data.items || [];
        if (items.length) setStations(items);
      })
      .catch(err => console.warn('Stations fetch failed, keeping previous:', err));
  }, [mounted]);

  const handleSearchResult = (lat: number, lon: number, zoom = 13) => {
    mapRef.current?.setView([lat, lon], zoom);
  };

  // Memoize valid markers
  const validStations = useMemo(() => 
    stations.filter(s => s.latitude && s.longitude && !isNaN(s.latitude) && !isNaN(s.longitude)),
    [stations]
  );

  if (!mounted) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  return (
    <div className="relative w-full h-full">
      <FloatingControls
        showHeatmap={showHeatmap}
        showMarkers={showMarkers}
        showCouncil={showCouncil}
        onToggleHeatmap={() => setShowHeatmap(v => !v)}
        onToggleMarkers={() => setShowMarkers(v => !v)}
        onToggleCouncil={() => setShowCouncil(v => !v)}
        onSearchResult={handleSearchResult}
        onFeedbackClick={() => setFeedbackOpen(true)}
      />

      {/* MapContainer never unmounts - key layers controlled via visibility */}
      <MapContainer
        center={[51.5074, -0.1278]}
        zoom={11}
        className="h-full w-full"
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapController onReady={map => { mapRef.current = map; }} />
        
        {/* Layers controlled by visibility, not conditional rendering */}
        {showCouncil && <CouncilLayer visible={showCouncil} />}
        
        {showMarkers && validStations.map(station => (
          <Marker key={station.id} position={[station.latitude, station.longitude]} icon={stationIcon}>
            <Popup><StationPopup station={station} /></Popup>
          </Marker>
        ))}
      </MapContainer>

      {feedbackOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setFeedbackOpen(false)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Feedback</h2>
            <p className="text-sm text-gray-600 mb-4">Feature coming soon</p>
            <button onClick={() => setFeedbackOpen(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

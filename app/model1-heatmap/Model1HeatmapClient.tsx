'use client';

import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import dynamic from 'next/dynamic';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

function MapController({ onMapReady }: { onMapReady: (map: L.Map) => void }) {
  const map = useMap();
  
  useEffect(() => {
    onMapReady(map);
  }, [map, onMapReady]);
  
  return null;
}

export default function Model1HeatmapClient() {
  const [stations, setStations] = useState<Station[]>([]);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCouncil, setShowCouncil] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    // Fetch stations
    fetch('/api/stations?bbox=-0.5,51.3,0.3,51.7')
      .then(res => res.json())
      .then(data => {
        if (data.stations) {
          setStations(data.stations);
        }
      })
      .catch(err => console.error('Failed to fetch stations:', err));
  }, []);

  const handleSearchResult = (lat: number, lon: number, zoom = 13) => {
    if (mapRef.current) {
      mapRef.current.setView([lat, lon], zoom);
    }
  };

  return (
    <div className="relative w-full h-screen">
      <FloatingControls
        showHeatmap={showHeatmap}
        showMarkers={showMarkers}
        showCouncil={showCouncil}
        onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
        onToggleMarkers={() => setShowMarkers(!showMarkers)}
        onToggleCouncil={() => setShowCouncil(!showCouncil)}
        onSearchResult={handleSearchResult}
        onFeedbackClick={() => setFeedbackOpen(true)}
      />

      <MapContainer
        center={[51.5074, -0.1278]}
        zoom={11}
        className="w-full h-full"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapController onMapReady={(map) => { mapRef.current = map; }} />
        
        <CouncilLayer visible={showCouncil} />

        {showMarkers && stations.map((station) => (
          <Marker
            key={station.id}
            position={[station.latitude, station.longitude]}
            icon={stationIcon}
          >
            <Popup>
              <StationPopup station={station} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {feedbackOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setFeedbackOpen(false)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Feedback</h2>
            <p className="text-sm text-gray-600">Feedback modal coming soon...</p>
            <button onClick={() => setFeedbackOpen(false)} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import dynamic from 'next/dynamic';
import { Icon } from 'leaflet';
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
    // Force map to recalculate size
    setTimeout(() => map.invalidateSize(), 100);
  }, [map, onMapReady]);
  
  return null;
}

export default function Model1HeatmapClient() {
  const [stations, setStations] = useState<Station[]>([]);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCouncil, setShowCouncil] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    fetch('/api/stations?bbox=-0.5,51.3,0.3,51.7')
      .then(res => res.json())
      .then(data => {
        if (data.stations) {
          setStations(data.stations);
        }
      })
      .catch(err => console.error('Failed to fetch stations:', err));
  }, [mounted]);

  const handleSearchResult = (lat: number, lon: number, zoom = 13) => {
    if (mapRef.current) {
      mapRef.current.setView([lat, lon], zoom);
    }
  };

  if (!mounted) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>Loading map...</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
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
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
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
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: '16px'
          }}
          onClick={() => setFeedbackOpen(false)}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '448px',
              width: '100%'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>Feedback</h2>
            <p style={{ fontSize: '14px', color: '#6b7280' }}>Feedback form coming soon...</p>
            <button 
              onClick={() => setFeedbackOpen(false)}
              style={{
                marginTop: '16px',
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: 'white',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

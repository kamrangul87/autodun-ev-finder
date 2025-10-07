'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { Icon, Map as LeafletMap, Marker as LeafletMarker, marker } from 'leaflet';
import dynamic from 'next/dynamic';
import FloatingControls from '@/components/Map/Controls/FloatingControls';
import StationPopup from '@/components/Map/Popup/StationPopup';

const CouncilLayer = dynamic(() => import('@/components/Map/CouncilLayer'), { ssr: false });

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
function MapController({ 
  stations, 
  showMarkers,
  onReady 
}: { 
  stations: Station[];
  showMarkers: boolean;
  onReady: (map: LeafletMap) => void;
}) {
  const map = useMap();
  const markersRef = useRef<LeafletMarker[]>([]);

  useEffect(() => {
    onReady(map);
    setTimeout(() => map.invalidateSize(), 100);
  }, [map, onReady]);

  // Imperatively add/remove markers (no MapContainer remount)
  useEffect(() => {
    // Clear existing
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    if (showMarkers && stations.length) {
      stations.forEach(s => {
        if (!s.latitude || !s.longitude || isNaN(s.latitude) || isNaN(s.longitude)) return;
        
        const m = marker([s.latitude, s.longitude], { icon: stationIcon })
          .bindPopup(() => {
            const div = document.createElement('div');
            div.innerHTML = `
              <div class="min-w-[280px]">
                <h3 class="font-bold text-base mb-2">${s.name || 'Charging Station'}</h3>
                <p class="text-sm">${s.address || ''}</p>
                ${s.postcode ? `<p class="text-xs font-mono">${s.postcode}</p>` : ''}
                ${s.connectors ? `<p class="text-xs text-gray-600">${s.connectors} connector(s)</p>` : ''}
              </div>
            `;
            return div;
          })
          .addTo(map);
        
        markersRef.current.push(m);
      });
    }

    return () => {
      markersRef.current.forEach(m => map.removeLayer(m));
      markersRef.current = [];
    };
  }, [map, stations, showMarkers]);

  return null;
}

export default function Model1HeatmapClient() {
  const [stations, setStations] = useState<Station[]>([]);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCouncil, setShowCouncil] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => setMounted(true), []);

  // Fetch once; keep previous on error (stale-while-revalidate)
  useEffect(() => {
    if (!mounted) return;
    
    fetch('/api/stations?bbox=-0.5,51.3,0.3,51.7')
      .then(res => res.ok ? res.json() : Promise.reject('Network error'))
      .then(data => {
        const items = data.stations || data.items || [];
        if (items.length) {
          setStations(items);
          setFetchError(false);
        }
      })
      .catch(err => {
        console.warn('Stations fetch failed, keeping previous markers:', err);
        setFetchError(true);
      });
  }, [mounted]);

  const handleSearchResult = (lat: number, lon: number, zoom = 13) => {
    mapRef.current?.flyTo([lat, lon], zoom, { duration: 1 });
  };

  if (!mounted) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading map...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Header - sticky with z-50 to stay above map */}
      <div className="sticky top-0 z-50 bg-white shadow-sm">
        <div className="px-4 py-2 flex items-center gap-4">
          <a href="/" className="font-bold text-lg">⚡ autodun</a>
          <input 
            type="text" 
            placeholder="Search city or postcode..." 
            className="flex-1 max-w-xs px-3 py-1.5 border rounded text-sm"
          />
          <button className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded">Go</button>
        </div>
        <div className="px-4 pb-2 flex gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showHeatmap} onChange={() => setShowHeatmap(v => !v)} />
            🔥 Heatmap
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showMarkers} onChange={() => setShowMarkers(v => !v)} />
            📍 Markers
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showCouncil} onChange={() => setShowCouncil(v => !v)} />
            🗺️ Council
          </label>
          <button onClick={() => setFeedbackOpen(true)} className="ml-auto px-3 py-1 bg-yellow-400 rounded text-xs font-medium">
            💬 Feedback
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-yellow-100 border border-yellow-400 px-4 py-2 rounded text-sm">
          Data temporarily unavailable, showing cached stations
        </div>
      )}

      {/* MapContainer never unmounts - layers controlled imperatively */}
      <div className="absolute inset-0 top-[88px]">
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
            errorTileUrl="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          />
          
          <MapController 
            stations={stations}
            showMarkers={showMarkers}
            onReady={m => { mapRef.current = m; }} 
          />
          
          {showCouncil && <CouncilLayer visible={true} />}
        </MapContainer>
      </div>

      {feedbackOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setFeedbackOpen(false)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Feedback</h2>
            <textarea className="w-full border rounded p-2 mb-4" rows={4} placeholder="Your feedback..."></textarea>
            <div className="flex gap-3">
              <button onClick={() => setFeedbackOpen(false)} className="flex-1 px-4 py-2 border rounded">Cancel</button>
              <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded">Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useRef, FormEvent, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon, Map as LeafletMap, LatLngBounds } from 'leaflet';
import dynamic from 'next/dynamic';

const CouncilLayer = dynamic(() => import('@/components/Map/CouncilLayer'), { ssr: false });
const HeatLayer = dynamic(() => import('@/components/Map/HeatmapLayer'), { ssr: false });

interface Station {
  id: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  connectors?: number;
}

const stationIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MapInit({ onReady, onMoveEnd }: { onReady: (map: LeafletMap) => void; onMoveEnd: (bounds: LatLngBounds) => void }) {
  const map = useMap();
  const initializedRef = useRef(false);
  
  useEffect(() => {
    onReady(map);
    setTimeout(() => map.invalidateSize(), 100);
    
    // Fetch on initial load (only once)
    if (!initializedRef.current) {
      console.log('[MapInit] Initial fetch triggered');
      onMoveEnd(map.getBounds());
      initializedRef.current = true;
    }
    
    // Fetch when map moves/zooms
    const handleMoveEnd = () => {
      console.log('[MapInit] Move end - fetching for new bounds');
      onMoveEnd(map.getBounds());
    };
    
    map.on('moveend', handleMoveEnd);
    
    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [map, onReady, onMoveEnd]);
  
  return null;
}

export default function Model1HeatmapClient() {
  const [stations, setStations] = useState<Station[]>([]);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCouncil, setShowCouncil] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout>();
  const lastFetchRef = useRef<string>('');

  useEffect(() => setMounted(true), []);

  const fetchStations = useCallback((bounds: LatLngBounds) => {
    // Debounce fetching
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    fetchTimeoutRef.current = setTimeout(() => {
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const bbox = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
      
      // Don't refetch if same bbox
      if (bbox === lastFetchRef.current) {
        console.log('[Fetch] Skipping - same bbox');
        return;
      }
      
      lastFetchRef.current = bbox;
      setLoading(true);
      setError(null);
      console.log('[Fetch] Starting for bbox:', bbox);
      
      const url = `/api/stations?bbox=${bbox}`;
      console.log('[Fetch] URL:', url);
      
      fetch(url)
        .then(res => {
          console.log('[Fetch] Response status:', res.status);
          console.log('[Fetch] Response headers:', Object.fromEntries(res.headers.entries()));
          if (!res.ok) {
            return res.text().then(text => {
              console.error('[Fetch] Error response body:', text);
              throw new Error(`HTTP ${res.status}: ${text.substring(0, 100)}`);
            });
          }
          return res.json();
        })
        .then(data => {
          console.log('[Fetch] Data received:', data);
          console.log('[Fetch] Data type:', typeof data, 'Is array:', Array.isArray(data));
          
          let items: any[] = [];
          
          if (Array.isArray(data)) {
            items = data;
          } else if (data.stations) {
            items = data.stations;
          } else if (data.items) {
            items = data.items;
          } else if (data.POIs) {
            items = data.POIs;
          } else if (data.data) {
            items = data.data;
          } else {
            console.warn('[Fetch] Unexpected data structure:', Object.keys(data));
          }
          
          console.log('[Fetch] Items extracted:', items.length);
          
          if (items.length > 0) {
            console.log('[Fetch] Sample item:', items[0]);
          }
          
          const transformed = items.map((s: any, idx: number) => ({
            id: s.id || s.ID || s.uuid || `station-${idx}`,
            latitude: s.latitude || s.lat || s.AddressInfo?.Latitude,
            longitude: s.longitude || s.lng || s.lon || s.AddressInfo?.Longitude,
            name: s.name || s.title || s.AddressInfo?.Title || 'Charging Station',
            address: s.address || s.AddressInfo?.AddressLine1,
            connectors: s.connectors || s.Connections?.length || s.NumberOfPoints || 0,
          })).filter((s: Station) => 
            s.latitude && s.longitude &&
            !isNaN(s.latitude) && !isNaN(s.longitude) &&
            s.latitude >= -90 && s.latitude <= 90 &&
            s.longitude >= -180 && s.longitude <= 180
          );
          
          console.log('[Fetch] Valid stations:', transformed.length);
          if (transformed.length > 0) {
            console.log('[Fetch] Sample transformed:', transformed[0]);
          }
          
          setStations(transformed);
          
          if (transformed.length === 0 && items.length > 0) {
            setError('API returned data but no valid coordinates found. Check console for details.');
          }
        })
        .catch(err => {
          console.error('[Fetch] Error:', err);
          setError(`Failed to load stations: ${err.message}`);
        })
        .finally(() => {
          setLoading(false);
        });
    }, 800);
  }, []);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || searching || !mapRef.current) return;

    setSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(searchQuery)}&format=json&countrycodes=gb&limit=1`,
        { headers: { 'User-Agent': 'autodun-ev-finder' } }
      );

      if (!response.ok) throw new Error('Search failed');
      
      const results = await response.json();
      
      if (results && results[0]) {
        const { lat, lon } = results[0];
        mapRef.current.flyTo([parseFloat(lat), parseFloat(lon)], 13, { duration: 1.5 });
      } else {
        alert('Location not found');
      }
    } catch (error) {
      console.error('[Search] Error:', error);
      alert('Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  if (!mounted) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', zIndex: 50, position: 'relative' }}>
        <form onSubmit={handleSearch} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <a href="/" style={{ fontWeight: 'bold', fontSize: '18px', textDecoration: 'none', color: 'inherit' }}>⚡ autodun</a>
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search city or postcode..." 
            disabled={searching}
            style={{ flex: '1 1 auto', maxWidth: '320px', padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px' }}
          />
          <button 
            type="submit"
            disabled={searching || !searchQuery.trim()}
            style={{ padding: '6px 12px', background: searching ? '#9ca3af' : '#2563eb', color: 'white', fontSize: '14px', borderRadius: '4px', border: 'none', cursor: searching ? 'not-allowed' : 'pointer' }}
          >
            {searching ? 'Searching...' : 'Go'}
          </button>
        </form>
        <div style={{ padding: '0 16px 8px', display: 'flex', gap: '16px', fontSize: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={showHeatmap} onChange={() => setShowHeatmap(v => !v)} />
            🔥 Heatmap
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={showMarkers} onChange={() => setShowMarkers(v => !v)} />
            📍 Markers ({stations.length})
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={showCouncil} onChange={() => setShowCouncil(v => !v)} />
            🗺️ Council
          </label>
          {loading && <span style={{ color: '#2563eb', fontSize: '12px', fontWeight: '500' }}>⟳ Loading...</span>}
          {error && <span style={{ color: '#dc2626', fontSize: '12px' }}>{error}</span>}
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
          <MapInit 
            onReady={m => { mapRef.current = m; }} 
            onMoveEnd={fetchStations}
          />
          
          {showCouncil && <CouncilLayer visible={true} />}
          
          {showHeatmap && stations.length > 0 && (
            <HeatLayer stations={stations} visible={true} />
          )}
          
          {showMarkers && stations.map(station => (
            <Marker 
              key={station.id} 
              position={[station.latitude, station.longitude]} 
              icon={stationIcon}
            >
              <Popup>
                <div style={{ minWidth: '200px' }}>
                  <h3 style={{ fontWeight: 'bold', marginBottom: '4px' }}>{station.name}</h3>
                  {station.address && <p style={{ fontSize: '14px', margin: '4px 0' }}>{station.address}</p>}
                  {station.connectors && station.connectors > 0 && (
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0' }}>
                      {station.connectors} connector(s)
                    </p>
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

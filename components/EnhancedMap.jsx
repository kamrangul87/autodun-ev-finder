import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Tooltip } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { calculateBoundsRadius, getCacheKey, computeCentroid } from '../utils/map-utils';
import { getCached, setCache } from '../lib/api-cache';

if (typeof window !== 'undefined') {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

const councilIcon = L.divIcon({
  html: '<div style="background:#f59e0b;width:10px;height:10px;border-radius:50%;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.3)"></div>',
  className: '',
  iconSize: [10, 10],
  iconAnchor: [5, 5]
});

function MapInitializer() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function HeatmapLayer({ stations, intensity = 1 }) {
  const map = useMap();
  const heatLayerRef = useRef(null);
  useEffect(() => {
    if (!map || !stations || stations.length === 0) {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      return;
    }
    import('leaflet.heat').then(() => {
      if (heatLayerRef.current) map.removeLayer(heatLayerRef.current);
      const heatData = stations.map(s => [s.lat, s.lng, (s.connectors || 1) * intensity]);
      heatLayerRef.current = L.heatLayer(heatData, {
        radius: 25, blur: 15, maxZoom: 17, max: 1.0,
        gradient: { 0.0: 'blue', 0.5: 'lime', 0.7: 'yellow', 1.0: 'red' }
      }).addTo(map);
    });
    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [map, stations, intensity]);
  return null;
}

function FeedbackForm({ station, onClose }) {
  const [type, setType] = useState('good');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: station.id,
          type,
          comment: comment.trim(),
          timestamp: new Date().toISOString()
        })
      });
      if (response.ok) {
        setSubmitted(true);
        setTimeout(() => onClose?.(), 2000);
      }
    } catch (error) {
      console.error('Feedback error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return <div style={{ padding: '12px', textAlign: 'center', color: '#10b981', fontWeight: '500' }}>✓ Thanks for your feedback!</div>;
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: '12px' }}>
      <div style={{ marginBottom: '8px' }}>
        <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>How was this station?</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={() => setType('good')} style={{ flex: 1, padding: '6px', fontSize: '12px', background: type === 'good' ? '#10b981' : '#e5e7eb', color: type === 'good' ? 'white' : '#6b7280', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>👍 Good</button>
          <button type="button" onClick={() => setType('bad')} style={{ flex: 1, padding: '6px', fontSize: '12px', background: type === 'bad' ? '#ef4444' : '#e5e7eb', color: type === 'bad' ? 'white' : '#6b7280', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>👎 Bad</button>
        </div>
      </div>
      <div style={{ marginBottom: '8px' }}>
        <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Comment (optional)</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 280))} maxLength={280} placeholder="Any additional details..." style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '4px', resize: 'vertical', minHeight: '60px' }} />
        <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'right' }}>{comment.length}/280</div>
      </div>
      <button type="submit" disabled={submitting} style={{ width: '100%', padding: '8px', fontSize: '12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: submitting ? 'wait' : 'pointer', fontWeight: '500' }}>{submitting ? 'Submitting...' : 'Submit Feedback'}</button>
    </form>
  );
}

function StationMarker({ station }) {
  const [showFeedback, setShowFeedback] = useState(false);
  const handleDirections = () => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`, '_blank');
  };
  return (
    <Marker position={[station.lat, station.lng]}>
      <Popup maxWidth={280} onClose={() => setShowFeedback(false)}>
        <div style={{ padding: '8px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold' }}>{station.name}</h3>
          {station.address && <p style={{ margin: '4px 0', fontSize: '12px', color: '#666' }}>{station.address}</p>}
          {station.postcode && <p style={{ margin: '4px 0', fontSize: '12px', color: '#666' }}>{station.postcode}</p>}
          <p style={{ margin: '4px 0', fontSize: '12px', color: '#333' }}><strong>Connectors:</strong> {station.connectors}</p>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowFeedback(!showFeedback)} style={{ flex: 1, padding: '6px 12px', fontSize: '12px', background: showFeedback ? '#6b7280' : '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{showFeedback ? 'Cancel' : '💬 Feedback'}</button>
            <button onClick={handleDirections} style={{ flex: 1, padding: '6px 12px', fontSize: '12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🧭 Directions</button>
          </div>
          {showFeedback && <FeedbackForm station={station} onClose={() => setShowFeedback(false)} />}
        </div>
      </Popup>
    </Marker>
  );
}

function CouncilMarker({ feature }) {
  const centroid = computeCentroid(feature.geometry.coordinates);
  if (!centroid) return null;
  return (
    <Marker position={[centroid.lat, centroid.lng]} icon={councilIcon}>
      <Tooltip direction="top" opacity={0.9}>{feature.properties.name}</Tooltip>
    </Marker>
  );
}

function ViewportFetcher({ onFetchStations, onLoadingChange, searchResult, shouldZoomToData, stations }) {
  const map = useMap();
  const fetchTimeoutRef = useRef(null);
  const lastFetchRef = useRef(null);

  const fetchForViewport = useCallback(async () => {
    const bounds = map.getBounds();
    const center = bounds.getCenter();
    const radius = calculateBoundsRadius(bounds);
    const cacheKey = getCacheKey(center.lat, center.lng, radius);

    if (lastFetchRef.current === cacheKey) return;

    const cached = getCached(cacheKey);
    if (cached) {
      lastFetchRef.current = cacheKey;
      onFetchStations?.(cached);
      return;
    }

    try {
      onLoadingChange?.(true);
      const url = `/api/stations?lat=${center.lat}&lng=${center.lng}&radius=${radius}&max=1000`;
      const response = await fetch(url);
      const data = await response.json();
      if (response.ok) {
        setCache(cacheKey, data);
        lastFetchRef.current = cacheKey;
        onFetchStations?.(data);
      } else {
        console.error('API error:', data.error || 'Failed to fetch stations');
      }
    } catch (error) {
      console.error('Viewport fetch error:', error);
      lastFetchRef.current = null;
    } finally {
      onLoadingChange?.(false);
    }
  }, [map, onFetchStations, onLoadingChange]);

  useMapEvents({
    moveend: () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(fetchForViewport, 500);
    }
  });

  useEffect(() => {
    fetchForViewport();
  }, []);

  useEffect(() => {
    if (searchResult) {
      map.setView([searchResult.lat, searchResult.lng], 13);
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => {
        fetchForViewport();
      }, 500);
    }
  }, [map, searchResult, fetchForViewport]);

  useEffect(() => {
    if (shouldZoomToData && stations && stations.length > 0) {
      const bounds = L.latLngBounds(stations.map(s => [s.lat, s.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, stations, shouldZoomToData]);

  return null;
}

export default function EnhancedMap({ 
  stations = [], 
  showHeatmap = false, 
  showMarkers = true, 
  showCouncil = false, 
  councilData = null, 
  searchResult = null, 
  shouldZoomToData = false,
  onFetchStations,
  onLoadingChange,
  isLoading = false
}) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {isLoading && (
        <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000, background: 'white', padding: '8px 12px', borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '16px', height: '16px', border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
          <span style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>Loading stations...</span>
        </div>
      )}
      <MapContainer 
        center={[51.5074, -0.1278]} 
        zoom={10} 
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
        scrollWheelZoom={true}
      >
        <MapInitializer />
        <TileLayer 
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' 
          url={process.env.NEXT_PUBLIC_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
          maxZoom={19}
        />
        <ViewportFetcher 
          onFetchStations={onFetchStations}
          onLoadingChange={onLoadingChange}
          searchResult={searchResult} 
          shouldZoomToData={shouldZoomToData}
          stations={stations}
        />
        {showHeatmap && <HeatmapLayer stations={stations} />}
        {showMarkers && (
          <MarkerClusterGroup chunkedLoading>
            {stations.map(station => <StationMarker key={station.id} station={station} />)}
          </MarkerClusterGroup>
        )}
        {showCouncil && councilData && councilData.features && councilData.features.map((feature, idx) => (
          <CouncilMarker key={`council-${idx}`} feature={feature} />
        ))}
      </MapContainer>
      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

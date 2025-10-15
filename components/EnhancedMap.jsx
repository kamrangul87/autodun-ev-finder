import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Tooltip, GeoJSON } from 'react-leaflet';
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
  html: '<div style="background:#9333ea;width:12px;height:12px;transform:rotate(45deg);border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.4)"></div>',
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6]
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
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const updateZoom = () => setZoom(map.getZoom());
    map.on('zoomend', updateZoom);
    return () => map.off('zoomend', updateZoom);
  }, [map]);

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
      
      const currentZoom = map.getZoom();
      const radius = Math.max(12, Math.min(35, 35 - (currentZoom - 10) * 2.3));
      
      let processedStations = stations;
      if (stations.length > 25000) {
        processedStations = stations.filter((_, idx) => idx % 3 === 0);
        console.log(`[HeatmapLayer] Downsampled ${stations.length} to ${processedStations.length} points for performance`);
      }
      
      const maxIntensity = Math.max(...processedStations.map(s => s.connectors || 1));
      
      const heatData = processedStations.map(s => [
        s.lat, 
        s.lng, 
        ((s.connectors || 1) / maxIntensity) * intensity
      ]);
      
      heatLayerRef.current = L.heatLayer(heatData, {
        radius: radius,
        blur: 15,
        maxZoom: 17,
        max: 1.0,
        gradient: { 
          0.0: 'green', 
          0.4: 'yellow', 
          0.7: 'orange', 
          1.0: 'red' 
        }
      }).addTo(map);
    });
    
    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [map, stations, intensity, zoom]);
  
  return null;
}

function FeedbackForm({ station, onClose }) {
  const map = useMap();
  const [type, setType] = useState('good');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (map) {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      if (map.boxZoom) map.boxZoom.disable();
    }
    return () => {
      if (map) {
        map.dragging.enable();
        map.scrollWheelZoom.enable();
        if (map.boxZoom) map.boxZoom.enable();
      }
    };
  }, [map]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: station.id,
          vote: type,
          text: comment.trim(),
          timestamp: new Date().toISOString()
        })
      });
      if (response.ok || response.status === 204) {
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
    <form onSubmit={handleSubmit} className="feedback-form" style={{ marginTop: '12px', padding: '12px', background: '#f9fafb', borderRadius: '6px' }}>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>How was this station?</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={() => setType('good')} style={{ flex: 1, padding: '10px', fontSize: '14px', background: type === 'good' ? '#10b981' : '#e5e7eb', color: type === 'good' ? 'white' : '#6b7280', border: 'none', borderRadius: '6px', cursor: 'pointer', minHeight: '40px' }}>👍 Good</button>
          <button type="button" onClick={() => setType('bad')} style={{ flex: 1, padding: '10px', fontSize: '14px', background: type === 'bad' ? '#ef4444' : '#e5e7eb', color: type === 'bad' ? 'white' : '#6b7280', border: 'none', borderRadius: '6px', cursor: 'pointer', minHeight: '40px' }}>👎 Bad</button>
        </div>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>Comment (optional)</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 280))} maxLength={280} placeholder="Any additional details..." style={{ width: '100%', padding: '10px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '6px', resize: 'vertical', minHeight: '80px', wordBreak: 'break-word' }} />
        <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'right', marginTop: '4px' }}>{comment.length}/280</div>
      </div>
      <button type="submit" disabled={submitting} style={{ width: '100%', padding: '12px', fontSize: '14px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: submitting ? 'wait' : 'pointer', fontWeight: '500', minHeight: '40px' }}>{submitting ? 'Submitting...' : 'Submit Feedback'}</button>
      <style jsx>{`
        .feedback-form {
          pointer-events: auto;
        }
        @media (max-width: 768px) {
          .feedback-form::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9999;
            pointer-events: auto;
          }
          .feedback-form {
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            margin: 0 !important;
            padding: 20px !important;
            background: white !important;
            border-radius: 16px 16px 0 0 !important;
            box-shadow: 0 -4px 12px rgba(0,0,0,0.2) !important;
            z-index: 10000 !important;
            max-height: 80vh;
            overflow-y: auto;
            pointer-events: auto;
          }
        }
      `}</style>
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
      <Popup maxWidth={280} closeOnClick={false} autoClose={false} onClose={() => setShowFeedback(false)}>
        <div style={{ padding: '8px' }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
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

function CouncilMarker({ feature, stations = [] }) {
  const map = useMap();
  const centroid = computeCentroid(feature.geometry.coordinates);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueComment, setIssueComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  if (!centroid) return null;

  const stationsToCheck = stations.length > 10000 
    ? stations.filter((_, idx) => idx % Math.ceil(stations.length / 5000) === 0).slice(0, 5000)
    : stations;
  
  const stationCount = stationsToCheck.filter(station => {
    if (!feature.geometry || !feature.geometry.coordinates) return false;
    const point = [station.lng, station.lat];
    return pointInPolygon(point, feature.geometry.coordinates);
  }).length;
  
  const actualCount = stations.length > 10000 
    ? Math.round((stationCount / stationsToCheck.length) * stations.length)
    : stationCount;

  const zoomToBorough = () => {
    if (feature.geometry && feature.geometry.coordinates) {
      const coords = flattenCoordinates(feature.geometry.coordinates);
      if (coords.length > 0) {
        const bounds = L.latLngBounds(coords.map(c => [c[1], c[0]]));
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    }
  };

  const handleReportIssue = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: `council-${feature.properties.name}`,
          type: 'council',
          comment: issueComment.trim(),
          timestamp: new Date().toISOString(),
          councilId: feature.properties.name
        })
      });
      setSubmitted(true);
      setTimeout(() => {
        setShowIssueForm(false);
        setSubmitted(false);
        setIssueComment('');
      }, 2000);
    } catch (error) {
      console.error('Report issue error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Marker position={[centroid.lat, centroid.lng]} icon={councilIcon}>
      <Popup maxWidth={240} closeOnClick={false} autoClose={false} onClose={() => setShowIssueForm(false)}>
        <div style={{ padding: '8px' }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold' }}>{feature.properties.name}</h3>
          <p style={{ margin: '4px 0', fontSize: '12px', color: '#666' }}>
            <strong>Stations in boundary: {actualCount}</strong>
          </p>
          <button 
            onClick={zoomToBorough}
            style={{ 
              marginTop: '8px', 
              width: '100%', 
              padding: '6px 12px', 
              fontSize: '12px', 
              background: '#9333ea', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer' 
            }}
          >
            🔍 Zoom to borough
          </button>
          
          {!showIssueForm && !submitted && (
            <button 
              onClick={() => setShowIssueForm(true)}
              style={{ 
                marginTop: '8px', 
                width: '100%', 
                padding: '6px 12px', 
                fontSize: '12px', 
                background: '#f59e0b', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px', 
                cursor: 'pointer' 
              }}
            >
              ⚠️ Report boundary issue
            </button>
          )}
          
          {showIssueForm && !submitted && (
            <form onSubmit={handleReportIssue} style={{ marginTop: '8px' }}>
              <textarea 
                value={issueComment} 
                onChange={(e) => setIssueComment(e.target.value.slice(0, 280))} 
                maxLength={280}
                placeholder="Describe the boundary issue..." 
                style={{ 
                  width: '100%', 
                  padding: '6px', 
                  fontSize: '11px', 
                  border: '1px solid #d1d5db', 
                  borderRadius: '4px', 
                  resize: 'vertical', 
                  minHeight: '50px',
                  marginBottom: '4px'
                }} 
              />
              <div style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'right', marginBottom: '6px' }}>{issueComment.length}/280</div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button 
                  type="button"
                  
                  style={{ 
                    flex: 1,
                    padding: '4px 8px', 
                    fontSize: '11px', 
                    background: '#6b7280', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: 'pointer' 
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={submitting || !issueComment.trim()}
                  style={{ 
                    flex: 1,
                    padding: '4px 8px', 
                    fontSize: '11px', 
                    background: issueComment.trim() ? '#f59e0b' : '#d1d5db', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: submitting || !issueComment.trim() ? 'not-allowed' : 'pointer' 
                  }}
                >
                  {submitting ? 'Sending...' : 'Submit'}
                </button>
              </div>
            </form>
          )}
          
          {submitted && (
            <div style={{ marginTop: '8px', padding: '8px', textAlign: 'center', color: '#10b981', fontSize: '11px', fontWeight: '500' }}>
              ✓ Thanks for reporting!
            </div>
          )}
        </div>
      </Popup>
      <Tooltip direction="top" opacity={0.9}>{feature.properties.name}</Tooltip>
    </Marker>
  );
}

function pointInPolygon(point, coords) {
  const polygons = coords[0] && Array.isArray(coords[0][0]) ? coords : [coords];
  for (const polygon of polygons) {
    let inside = false;
    const ring = polygon[0] || polygon;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > point[1]) !== (yj > point[1])) && 
                       (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

function flattenCoordinates(coords) {
  if (!coords || coords.length === 0) return [];
  if (typeof coords[0] === 'number') return [coords];
  if (Array.isArray(coords[0][0])) return coords[0];
  return coords;
}

function ViewportFetcher({ onFetchStations, onLoadingChange, searchResult, shouldZoomToData, stations }) {
  const map = useMap();
  const fetchTimeoutRef = useRef(null);
  const lastFetchRef = useRef(null);
  const isFirstFetchRef = useRef(true);

  const fetchForViewport = useCallback(async (isFirstLoad = false) => {
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const bboxStr = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
    
    if (lastFetchRef.current === bboxStr) return;

    const cacheKey = `bbox_${bboxStr}`;
    const cached = getCached(cacheKey);
    if (cached) {
      lastFetchRef.current = bboxStr;
      onFetchStations?.(cached);
      return;
    }

    try {
      onLoadingChange?.(true);
      const tiles = isFirstLoad ? 4 : 2;
      const limitPerTile = isFirstLoad ? 500 : 750;
      const url = `/api/stations?bbox=${bboxStr}&tiles=${tiles}&limitPerTile=${limitPerTile}`;
      const response = await fetch(url, { cache: 'no-store' });
      const data = await response.json();
      if (response.ok) {
        const normalizedData = {
          items: data.features ? data.features.map(f => f.properties) : [],
          count: data.count,
          source: data.source,
          bbox: data.bbox
        };
        setCache(cacheKey, normalizedData);
        lastFetchRef.current = bboxStr;
        onFetchStations?.(normalizedData);
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
      fetchTimeoutRef.current = setTimeout(() => fetchForViewport(false), 400);
    }
  });

  useEffect(() => {
    if (isFirstFetchRef.current) {
      const bboxStr = `-8.649,49.823,1.763,60.845`;
      lastFetchRef.current = bboxStr;
      isFirstFetchRef.current = false;
    }
  }, [map]);

  useEffect(() => {
    if (searchResult) {
      map.setView([searchResult.lat, searchResult.lng], 13);
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => {
        fetchForViewport(false);
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
        <div style={{ position: 'absolute', bottom: '10px', left: '10px', zIndex: 1000, background: 'white', padding: '6px 10px', borderRadius: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '14px', height: '14px', border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
          <span style={{ fontSize: '11px', fontWeight: '500', color: '#374151' }}>Loading…</span>
        </div>
      )}
      <div style={{ position: 'absolute', bottom: '10px', right: '10px', zIndex: 1000, background: 'white', padding: '8px', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', fontSize: '11px' }}>
        <div style={{ fontWeight: '600', marginBottom: '6px', color: '#1f2937' }}>Legend</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <div style={{ width: '12px', height: '12px', background: '#3b82f6', borderRadius: '50%' }}></div>
          <span>Charging stations</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <div style={{ width: '12px', height: '12px', background: '#9333ea', transform: 'rotate(45deg)', border: '1px solid white' }}></div>
          <span>Council markers</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '20px', height: '0', borderTop: '2px dashed #ff6b35' }}></div>
          <span>Council boundaries</span>
        </div>
      </div>
      <MapContainer 
        center={[54.5, -4]} 
        zoom={6} 
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
        scrollWheelZoom={true}
        bounds={[[-8.649, 49.823], [1.763, 60.845]]}
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
        {showCouncil && councilData && (
          <>
            <GeoJSON 
              data={councilData} 
              style={{ 
                color: '#ff6b35', 
                weight: 2, 
                opacity: 0.8, 
                fillOpacity: 0.05, 
                dashArray: '5, 5' 
              }}
            />
            {councilData.features && councilData.features.map((feature, idx) => (
              <CouncilMarker key={`council-${idx}`} feature={feature} stations={stations} />
            ))}
          </>
        )}
      </MapContainer>
      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

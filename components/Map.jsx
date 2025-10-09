// components/Map.jsx
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function HeatmapLayer({ stations, intensity = 1 }) {
  const map = useMap();
  const heatLayerRef = useRef(null);
  useEffect(() => {
    if (!map || !stations || stations.length === 0) return;
    import('leaflet.heat').then(() => {
      if (heatLayerRef.current) map.removeLayer(heatLayerRef.current);
      const heatData = stations.map(s => [s.lat, s.lng, (s.connectors || 1) * intensity]);
      heatLayerRef.current = L.heatLayer(heatData, {
        radius: 25, blur: 15, maxZoom: 17, max: 1.0,
        gradient: { 0.0: 'blue', 0.5: 'lime', 0.7: 'yellow', 1.0: 'red' }
      }).addTo(map);
    });
    return () => { if (heatLayerRef.current) map.removeLayer(heatLayerRef.current); };
  }, [map, stations, intensity]);
  return null;
}

function StationMarker({ station, onFeedback }) {
  const handleDirections = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const handleQuickFeedback = async () => {
    try {
      onFeedback?.(station.id);
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId: station.id, type: 'quick', timestamp: new Date().toISOString() })
      });
      if (response.ok) alert('Thanks for your feedback!');
    } catch (error) {
      console.error('Feedback error:', error);
    }
  };
  return (
    <Marker position={[station.lat, station.lng]}>
      <Popup maxWidth={250}>
        <div style={{ padding: '8px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold' }}>
            {station.name || 'EV Station'}
          </h3>
          {station.address && <p style={{ margin: '4px 0', fontSize: '12px', color: '#666' }}>{station.address}</p>}
          {station.postcode && <p style={{ margin: '4px 0', fontSize: '12px', color: '#666' }}>{station.postcode}</p>}
          {station.connectors && (
            <p style={{ margin: '4px 0', fontSize: '12px', color: '#333' }}>
              <strong>Connectors:</strong> {station.connectors}
            </p>
          )}
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <button onClick={handleQuickFeedback} style={{ flex: 1, padding: '6px 12px', fontSize: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              👍 Feedback
            </button>
            <button onClick={handleDirections} style={{ flex: 1, padding: '6px 12px', fontSize: '12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              🧭 Directions
            </button>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

function MapControl({ stations, searchResult, shouldZoomToData }) {
  const map = useMap();
  useEffect(() => {
    if (searchResult) map.setView([searchResult.lat, searchResult.lng], 14);
  }, [map, searchResult]);
  useEffect(() => {
    if (shouldZoomToData && stations && stations.length > 0) {
      const bounds = L.latLngBounds(stations.map(s => [s.lat, s.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, stations, shouldZoomToData]);
  return null;
}

function CouncilLayer({ geojson }) {
  const councilStyle = { color: '#ff6b35', weight: 2, opacity: 0.8, fillOpacity: 0.1, dashArray: '5, 5' };
  const onEachFeature = (feature, layer) => {
    if (feature.properties && feature.properties.name) {
      layer.bindTooltip(feature.properties.name, { permanent: false, direction: 'center', className: 'council-tooltip' });
    }
  };
  return geojson ? <GeoJSON data={geojson} style={councilStyle} onEachFeature={onEachFeature} /> : null;
}

export default function Map({ stations = [], showHeatmap = false, showMarkers = true, showCouncil = false, councilData = null, searchResult = null, shouldZoomToData = false, onFeedback }) {
  const defaultCenter = [51.5074, -0.1278];
  const defaultZoom = 10;
  return (
    <MapContainer center={defaultCenter} zoom={defaultZoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {showHeatmap && <HeatmapLayer stations={stations} />}
      {showMarkers && stations.map(station => <StationMarker key={station.id} station={station} onFeedback={onFeedback} />)}
      {showCouncil && <CouncilLayer geojson={councilData} />}
      <MapControl stations={stations} searchResult={searchResult} shouldZoomToData={shouldZoomToData} />
    </MapContainer>
  );
}

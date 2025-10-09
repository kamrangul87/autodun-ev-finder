// components/Map.jsx
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix default marker icons (Next bundling)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Ensure tiles render when container size changes
function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 0);
  }, [map]);
  return null;
}

function HeatmapLayer({ stations }) {
  const map = useMap();
  const ref = useRef(null);
  useEffect(() => {
    if (!map || !stations?.length) return;
    import('leaflet.heat').then(() => {
      if (ref.current) map.removeLayer(ref.current);
      const pts = stations.map(s => [s.lat, s.lng, Math.max(1, s.connectors || 1)]);
      ref.current = L.heatLayer(pts, { radius: 25, blur: 15, maxZoom: 17 }).addTo(map);
    });
    return () => { if (ref.current) map.removeLayer(ref.current); };
  }, [map, stations]);
  return null;
}

function CouncilLayer({ geojson }) {
  if (!geojson) return null;
  const style = { color: '#ff6b35', weight: 2, opacity: 0.9, dashArray: '6 4', fillOpacity: 0.05 };
  const each = (f, l) => {
    const n = f?.properties?.name;
    if (n) l.bindTooltip(n, { direction: 'center' });
  };
  return <GeoJSON data={geojson} style={style} onEachFeature={each} />;
}

function StationMarker({ s }) {
  const directions = () =>
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`, '_blank', 'noopener,noreferrer');
  const feedback = async () => {
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId: s.id, type: 'quick', timestamp: new Date().toISOString() })
      });
      if (r.ok) alert('Thanks for your feedback!');
    } catch {}
  };
  return (
    <Marker position={[s.lat, s.lng]}>
      <Popup>
        <div style={{ minWidth: 180 }}>
          <strong>{s.name || 'EV Station'}</strong>
          {s.address && <div style={{ color:'#666' }}>{s.address}</div>}
          {s.postcode && <div style={{ color:'#666' }}>{s.postcode}</div>}
          {s.connectors != null && <div><b>Connectors:</b> {s.connectors}</div>}
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={feedback}  style={{ flex:1, padding:'6px 8px', background:'#10b981', color:'#fff', border:'none', borderRadius:4, cursor:'pointer' }}>👍 Feedback</button>
            <button onClick={directions} style={{ flex:1, padding:'6px 8px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:4, cursor:'pointer' }}>🧭 Directions</button>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

export default function Map({
  stations = [],
  showHeatmap = false,
  showMarkers = true,
  showCouncil = false,
  councilData = null,
}) {
  const center = [51.5074, -0.1278]; // London
  return (
    <MapContainer
      center={center}
      zoom={10}
      style={{ width: '100%', height: '75vh' }}
      scrollWheelZoom
    >
      <ResizeFix />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        referrerPolicy="no-referrer-when-downgrade"
        crossOrigin="anonymous"
      />
      {showHeatmap && <HeatmapLayer stations={stations} />}
      {showMarkers && stations.map((s) => <StationMarker key={s.id} s={s} />)}
      {showCouncil && <CouncilLayer geojson={councilData} />}
    </MapContainer>
  );
}

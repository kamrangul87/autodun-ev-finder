'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const MapContainer = dynamic(() => import('react-leaflet').then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((m) => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then((m) => m.Popup), { ssr: false });

export default function Home() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCouncil, setShowCouncil] = useState(true);

  useEffect(() => {
    fetch('/api/stations')
      .then(r => r.json())
      .then(d => { 
        setStations(d.stations || []); 
        setLoading(false); 
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = stations.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-xl">Loading map...</div>;
  }

  return (
    <div className="relative w-full h-screen">
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-white shadow-lg">
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-3">🔌 autodun</h1>
          
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="Search UK postcode or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-2 border rounded-lg"
            />
            <button className="px-6 py-2 bg-blue-500 text-white rounded-lg">Go</button>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showHeatmap} onChange={(e) => setShowHeatmap(e.target.checked)} />
              <span>🔥 Heatmap</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showMarkers} onChange={(e) => setShowMarkers(e.target.checked)} />
              <span>📍 Markers ({filtered.length})</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showCouncil} onChange={(e) => setShowCouncil(e.target.checked)} />
              <span>🗺️ Council</span>
            </label>
          </div>
        </div>
      </div>

      <div className="w-full h-full pt-[160px]">
        <MapContainer 
          center={[54.5, -4.0]} 
          zoom={6} 
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer 
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
          />

          {showMarkers && filtered.map((s) => (
            <Marker key={s.id} position={[s.lat, s.lng]}>
              <Popup>
                <div className="p-3 min-w-[280px]">
                  <h3 className="font-bold text-lg mb-2">{s.name}</h3>
                  <p className="text-sm mb-1">📍 {s.address}</p>
                  <p className="text-sm mb-1">⚡ Type: {s.type}</p>
                  <p className="text-sm mb-3">🔌 Power: {s.power}</p>
                  
                  <div className="flex gap-2 mb-3">
                    
                      href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-3 py-2 bg-blue-500 text-white text-center rounded text-sm hover:bg-blue-600"
                    >
                      🧭 Directions
                    </a>
                    <button
                      onClick={() => {
                        const feedback = prompt(`Feedback for ${s.name}:\n\nYour message:`);
                        if (feedback) alert('Thank you for your feedback!');
                      }}
                      className="flex-1 px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                    >
                      💬 Feedback
                    </button>
                  </div>

                  <iframe
                    width="100%"
                    height="150"
                    frameBorder="0"
                    src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${s.lat},${s.lng}&zoom=15`}
                    allowFullScreen
                    title="Location"
                  />
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

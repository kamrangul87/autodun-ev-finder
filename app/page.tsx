'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const MapContainer = dynamic(
  () => import('react-leaflet').then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((m) => m.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((m) => m.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((m) => m.Popup),
  { ssr: false }
);

interface Station {
  id: number;
  name: string;
  lat: number;
  lng: number;
  address: string;
  type: string;
  power: string;
}

export default function Home() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stations')
      .then((r) => r.json())
      .then((d) => {
        setStations(d.stations || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-xl">Loading map...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen">
      <div className="absolute top-4 left-4 z-[1000] bg-white p-4 rounded shadow-lg">
        <h1 className="text-2xl font-bold">🔌 autodun</h1>
        <p className="text-sm text-gray-600">{stations.length} stations</p>
      </div>

      <div className="w-full h-full">
        <MapContainer
          center={[54.5, -4.0]}
          zoom={6}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {stations.map((station) => (
            <Marker key={station.id} position={[station.lat, station.lng]}>
              <Popup>
                <div className="p-2">
                  <h3 className="font-bold">{station.name}</h3>
                  <p className="text-sm">{station.address}</p>
                  <p className="text-sm">{station.type} - {station.power}</p>
                  
                    href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mt-2 px-3 py-1 bg-blue-500 text-white text-center rounded"
                  >
                    Directions
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

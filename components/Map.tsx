'use client';

import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useMemo } from 'react';

const icon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

type Props = { center: [number, number]; stations: any[]; };

export default function Map({ center, stations }: Props) {
  const markers = useMemo(() => stations.map(s => ({
    id: s.ID,
    pos: [s.AddressInfo?.Latitude, s.AddressInfo?.Longitude] as [number, number],
    title: s.AddressInfo?.Title,
    addr: `${s.AddressInfo?.AddressLine1 || ''}, ${s.AddressInfo?.Town || ''} ${s.AddressInfo?.Postcode || ''}`,
    connections: (s.Connections || []).map((c: any) => ({
      name: c.ConnectionType?.FormalName || c.ConnectionType?.Title || 'Connector',
      power: c.PowerKW
    }))
  })).filter(m => m.pos[0] && m.pos[1]), [stations]);

  return (
    <MapContainer center={center} zoom={12} style={{ height: 480, width: '100%' }} scrollWheelZoom={true}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map(m => (
        <Marker key={m.id} position={m.pos} icon={icon}>
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">{m.title}</p>
              <p className="text-gray-600">{m.addr}</p>
              <ul className="mt-1">
                {m.connections.map((c, i) => <li key={i}>{c.name}{c.power ? ` • ${c.power}kW` : ''}</li>)}
              </ul>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

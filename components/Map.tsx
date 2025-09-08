'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { useEffect, useMemo } from 'react';

type Station = any;

const icon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  shadowSize: [41, 41],
});

function FitToCenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, Math.max(map.getZoom(), 12), { animate: true });
  }, [center, map]);
  return null;
}

function BoundsReporter({
  onBoundsChange,
}: {
  onBoundsChange?: (b: { north: number; south: number; east: number; west: number }) => void;
}) {
  useMapEvents({
    moveend(e) {
      if (!onBoundsChange) return;
      const b = e.target.getBounds();
      onBoundsChange({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    },
    zoomend(e) {
      if (!onBoundsChange) return;
      const b = e.target.getBounds();
      onBoundsChange({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    },
  });
  return null;
}

export default function Map({
  center,
  stations,
  onBoundsChange,
}: {
  center: [number, number];
  stations: Station[];
  onBoundsChange?: (b: { north: number; south: number; east: number; west: number }) => void;
}) {
  const items = useMemo(() => (Array.isArray(stations) ? stations : []), [stations]);

  return (
    <MapContainer center={center} zoom={13} style={{ height: 520, width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> & contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToCenter center={center} />
      <BoundsReporter onBoundsChange={onBoundsChange} />

      <MarkerClusterGroup chunkedLoading>
        {items.map((s: any) => (
          <Marker
            key={s.ID}
            position={[s.AddressInfo?.Latitude, s.AddressInfo?.Longitude]}
            icon={icon}
          >
            <Popup>
              <div className="space-y-1">
                <div className="font-semibold">{s.AddressInfo?.Title}</div>
                <div className="text-sm text-gray-600">
                  {s.AddressInfo?.AddressLine1}, {s.AddressInfo?.Town} {s.AddressInfo?.Postcode}
                </div>
                <ul className="text-sm">
                  {(s.Connections ?? []).map((c: any, i: number) => (
                    <li key={i}>
                      {c.ConnectionType?.Title || c.ConnectionType?.FormalName || 'Connector'}
                      {c.PowerKW ? ` • ${c.PowerKW}kW` : ''}
                    </li>
                  ))}
                </ul>
                {s.AddressInfo?.RelatedURL ? (
                  <a
                    className="text-sm text-blue-600 underline"
                    href={s.AddressInfo.RelatedURL}
                    target="_blank"
                  >
                    More info
                  </a>
                ) : null}
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}

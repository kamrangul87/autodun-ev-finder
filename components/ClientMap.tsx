'use client';

import React, { useRef } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';

type Props = {
  initialCenter?: [number, number];
  initialZoom?: number;
};

export default function ClientMap({
  initialCenter = [51.5072, -0.1276],
  initialZoom = 9,
}: Props) {
  const mapRef = useRef<LeafletMap | null>(null);

  return (
    <div className="map-root">
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        ref={(ref) => {
          if (ref) mapRef.current = ref;
        }}
        className="leaflet-map"
        preferCanvas
        style={{ height: 'calc(100vh - 120px)' }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </MapContainer>
    </div>
  );
}

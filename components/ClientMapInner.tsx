'use client';

import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

/** All props are optional; we set safe defaults inside the component. */
export type Props = {
  initialCenter?: [number, number];
  initialZoom?: number;
  showHeatmap?: boolean;  // kept for compatibility (not used in this minimal example)
  showMarkers?: boolean;
  showCouncil?: boolean;  // kept for compatibility
};

const ClientMapInner: React.FC<Partial<Props>> = (props) => {
  const center = props.initialCenter ?? [51.5074, -0.1278]; // London
  const zoom   = props.initialZoom   ?? 12;
  const showMarkers = props.showMarkers ?? true;

  // Extra safety: never render on the server
  if (typeof window === 'undefined') return null;

  return (
    <div style={{ height: '80vh', width: '100%' }}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {showMarkers && (
          <Marker position={center}>
            <Popup>Center</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};

export default ClientMapInner;

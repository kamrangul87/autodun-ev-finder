'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Marker, Popup } from 'react-leaflet';

type Station = {
  id: number | string;
  name?: string;
  address?: string;
  postcode?: string;
  lat: number;
  lng: number;
  connectors?: number;
};

// The package's default export is a component.
const MarkerClusterGroup: any = dynamic(() => import('react-leaflet-cluster'), {
  ssr: false,
});

export default function ClusterLayer({ stations }: { stations: Station[] }) {
  if (!stations?.length) return null;

  return (
    <MarkerClusterGroup
      chunkedLoading
      showCoverageOnHover={false}
      spiderfyOnEveryZoom
      maxClusterRadius={60}
    >
      {stations.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]}>
          <Popup>
            <div style={{ minWidth: 220 }}>
              <strong>{s.name ?? 'EV Charging'}</strong>
              {s.address && <div>{s.address}</div>}
              {s.postcode && <div>{s.postcode}</div>}
              <div>Connectors: {s.connectors ?? 0}</div>
              <div style={{ marginTop: 8 }}>
                <a
                  href={`https://maps.google.com/?q=${s.lat},${s.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Google Maps
                </a>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MarkerClusterGroup>
  );
}

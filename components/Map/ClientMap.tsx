"use client";
import dynamic from 'next/dynamic';
import { useRef, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Pane, Marker, ZoomControl, GeoJSON } from 'react-leaflet';
import { Station } from '../../lib/stations/types';
import HeatLayer from './HeatLayer';
import { ensureLeafletIconFix } from '@/lib/leafletIconFix';

export default function ClientMap({ stations, bounds, councilGeoJson, showCouncil, onZoomToData }: {
  stations: Station[];
  bounds: [[number, number], [number, number]];
  councilGeoJson?: any;
  showCouncil: boolean;
  onZoomToData: () => void;
}) {
  const mapRef = useRef<any>(null);
  useEffect(() => { ensureLeafletIconFix(); }, []);
  useEffect(() => {
    if (mapRef.current && bounds) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [bounds]);

  return (
    <MapContainer
      ref={mapRef}
      style={{ height: '100%', width: '100%' }}
      zoom={12}
      center={[(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]}
      zoomControl={false}
    >
      <ZoomControl position="topright" />
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Pane name="markers" style={{ zIndex: 650 }}>
        {stations.map(s => (
          <Marker key={s.id} position={[s.lat, s.lng]} />
        ))}
      </Pane>
      <Pane name="heat" style={{ zIndex: 600 }}>
        <HeatLayer points={stations.map(s => [s.lat, s.lng, 0.7])} />
      </Pane>
      {showCouncil && councilGeoJson && (
        <Pane name="council" style={{ zIndex: 500 }}>
          <GeoJSON data={councilGeoJson} style={() => ({ weight: 1, color: '#3b82f6', fillOpacity: 0.08 })} />
        </Pane>
      )}
    </MapContainer>
  );
}

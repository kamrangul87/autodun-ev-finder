"use client";
import { useRef, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Pane, Marker, ZoomControl, GeoJSON } from 'react-leaflet';
import { Station } from '../../lib/stations/types';
import HeatLayer from './HeatLayer';

export default function ClientMap({ stations, bounds, councilGeoJson, showCouncil, onZoomToData }: {
  stations: Station[];
  bounds: [[number, number], [number, number]];
  councilGeoJson?: any;
  showCouncil: boolean;
  onZoomToData: () => void;
}) {
  const [map, setMap] = useState<any>(null);
  useEffect(() => {
    if (!map) return;
    const onReady = () => map.invalidateSize();
    onReady();
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [map]);
  useEffect(() => {
    if (map && bounds) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [map, bounds]);

  return (
    <MapContainer
      className="h-full w-full"
      style={{ height: '100%', width: '100%', minHeight: '75vh' }}
      center={[51.515, -0.141]}
      zoom={13}
      scrollWheelZoom
      preferCanvas
      ref={node => { if (node) setMap(node); }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
      <ZoomControl position="topright" />
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

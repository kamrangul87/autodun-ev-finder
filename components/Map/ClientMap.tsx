"use client";
import { useEffect, useState } from 'react';
import { useInvalidateOnResize } from '../../lib/hooks/useInvalidateOnResize';
import { MapContainer, TileLayer, Pane, Marker, Popup, ZoomControl, GeoJSON } from 'react-leaflet';
import type { Station } from '../../types/stations';
import HeatLayer from './HeatLayer';
import { createStationDivIcon } from '../../lib/icons/stationDivIcon';

export default function ClientMap({ bounds, councilGeoJson, showCouncil, heatOn, markersOn, onZoomToData }: {
  bounds: [[number, number], [number, number]];
  councilGeoJson?: any;
  showCouncil: boolean;
  heatOn: boolean;
  markersOn: boolean;
  onZoomToData: () => void;
}) {
  const [map, setMap] = useState<any>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);
  useInvalidateOnResize(map);

  // Fetch stations after map is ready and on moveend
  useEffect(() => {
    if (!map) return;
    let timeout: any;
    const fetchStations = async () => {
      setLoading(true);
      const b = map.getBounds();
      const bbox = `(${b.getSouth()},${b.getWest()}),(${b.getNorth()},${b.getEast()})`;
      const url = `/api/stations?bbox=${encodeURIComponent(bbox)}&max=200`;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const data = await res.json();
        setStations(Array.isArray(data.items) ? data.items : []);
        setSource(data.source ?? '');
        setDebug(data.debug ?? {});
        console.log('stations-debug', data.debug);
      } catch {
        setStations([]);
      } finally {
        setLoading(false);
      }
    };
    fetchStations();
    const onMoveEnd = () => {
      clearTimeout(timeout);
      timeout = setTimeout(fetchStations, 400);
    };
    map.on('moveend', onMoveEnd);
    return () => {
      map.off('moveend', onMoveEnd);
      clearTimeout(timeout);
    };
  }, [map]);

  const [source, setSource] = useState('');
  const [debug, setDebug] = useState<any>({});

  useEffect(() => {
    if (!map || stations.length === 0) return;
    (async () => {
      const L = (await import('leaflet')).default;
      const b = L.latLngBounds(stations.map(s => [s.lat, s.lng] as [number, number]));
      map.fitBounds(b, { padding: [40, 40] });
    })();
  }, [map, stations]);

  const heatPoints: [number, number, number][] = stations.map(s => [s.lat, s.lng, Math.max(0.3, Math.min(1, Array.isArray(s.connectors) ? s.connectors.length / 3 : 1))]);
  return (
    <div className="relative h-full w-full">
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
        {markersOn && (
          <Pane name="stations" style={{ zIndex: 650 }}>
            {stations.map(s => (
              <Marker key={String(s.id)} position={[s.lat, s.lng]} icon={createStationDivIcon(28)}>
                <Popup>
                  <b>{s.name ?? 'Charging station'}</b><br/>
                  {s.address ?? ''}<br/>{s.postcode ?? ''}<br/>
                  {Array.isArray(s.connectors) ? `${s.connectors.length} connectors` : null}
                </Popup>
              </Marker>
            ))}
          </Pane>
        )}
        {heatOn && (
          <Pane name="heat" style={{ zIndex: 600 }}>
            <HeatLayer points={heatPoints} radius={32} blur={20} max={1.0} />
          </Pane>
        )}
        {showCouncil && councilGeoJson && (
          <Pane name="council" style={{ zIndex: 500 }}>
            <GeoJSON data={councilGeoJson} style={() => ({ weight: 1, color: '#3b82f6', fillOpacity: 0.08 })} />
          </Pane>
        )}
      </MapContainer>
      <div className="absolute bottom-2 left-2 text-xs bg-white/80 rounded px-2 py-1 shadow z-[1200]">
        Stations: {stations.length} [{source}]<br />
        Data: Open Charge Map
      </div>
    </div>
  );
}

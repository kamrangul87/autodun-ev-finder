'use client';

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { useEffect, useMemo } from 'react';

// --- Heat layer wrapper (loads leaflet.heat dynamically) ---
function HeatLayer({ points }: { points: Array<[number, number, number?]> }) {
  const map = useMap();

  useEffect(() => {
    let layer: any;

    (async () => {
      const Lmod = await import('leaflet');
      await import('leaflet.heat');
      // @ts-ignore - plugin augments Leaflet at runtime
      layer = (Lmod as any).heatLayer(points, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
      });
      layer.addTo(map);
    })();

    return () => {
      if (layer) map.removeLayer(layer);
    };
  }, [map, points]);

  return null;
}

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

type MapProps = {
  center: [number, number];
  stations: Station[];
  onBoundsChange?: (b: { north: number; south: number; east: number; west: number }) => void;
  /** 'markers' (default) shows clusters; 'heat' shows a heatmap */
  mode?: 'markers' | 'heat';
};

export default function Map({
  center,
  stations,
  onBoundsChange,
  mode = 'markers',
}: MapProps) {
  const items = useMemo(() => (Array.isArray(stations) ? stations : []), [stations]);

  // Prepare heat points: [lat, lon, weight]
  const heatPoints: Array<[number, number, number]> = useMemo(() => {
    return items
      .map((s: any) => {
        const lat = s?.AddressInfo?.Latitude;
        const lon = s?.AddressInfo?.Longitude;
        if (typeof lat !== 'number' || typeof lon !== 'number') return null;

        // Use max PowerKW as intensity, normalized to 0..1 (tweak as you like)
        const maxKw = Math.max(
          0,
          ...(s?.Connections || []).map((c: any) => Number(c?.PowerKW) || 0)
        );
        const weight = Math.min(1, maxKw / 150); // simple normalization
        return [lat, lon, weight] as [number, number, number];
      })
      .filter(Boolean) as Array<[number, number, number]>;
  }, [items]);

  return (
    <MapContainer center={center} zoom={13} style={{ height: 520, width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> & contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitToCenter center={center} />
      <BoundsReporter onBoundsChange={onBoundsChange} />

      {mode === 'heat' ? (
        <HeatLayer points={heatPoints} />
      ) : (
        <MarkerClusterGroup chunkedLoading>
          {items
            .filter((s: any) => typeof s?.AddressInfo?.Latitude === 'number' && typeof s?.AddressInfo?.Longitude === 'number')
            .map((s: any) => (
              <Marker
                key={s.ID}
                position={[s.AddressInfo.Latitude, s.AddressInfo.Longitude]}
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
      )}
    </MapContainer>
  );
}

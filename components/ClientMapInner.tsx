'use client';

<<<<<<< HEAD
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
=======
import React, { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import {
  MapContainer,
  TileLayer,
  Pane,
  Polygon,
  CircleMarker,
  Popup,
} from 'react-leaflet';
import type { Map as LeafletMap, LatLngTuple } from 'leaflet';

import HeatmapWithScaling from '@/components/HeatmapWithScaling';
import SearchControl from '@/components/SearchControl';

export type Props = {
  initialCenter?: [number, number];
  initialZoom?: number;
  showHeatmap?: boolean;
  showMarkers?: boolean;
  showCouncil?: boolean;
  heatOptions?: { intensity?: number; radius?: number; blur?: number };
  onStationsCount?: (n: number) => void;
};

type Station = {
  id?: string | number;
  name?: string;
  address?: string;
  postcode?: string;
  source?: string;
  connectors?: number;
  lat: number;
  lng: number;
};

type CouncilGeoJSON = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties?: { name?: string };
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates:
        | number[][][]
        | number[][][][];
    };
  }>;
};

function normalizeStations(raw: any): Station[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((r: any): Station | null => {
        if (r && typeof r === 'object' && 'lat' in r && 'lng' in r) {
          return {
            id: r.id ?? undefined,
            name: r.name ?? undefined,
            address: r.address ?? undefined,
            postcode: r.postcode ?? undefined,
            source: r.source ?? undefined,
            connectors: Number.isFinite(r.connectors) ? Number(r.connectors) : undefined,
            lat: Number(r.lat),
            lng: Number(r.lng),
          };
        }
        if (Array.isArray(r) && (r.length === 2 || r.length === 3)) {
          const [lat, lng, connectors] = r;
          return {
            lat: Number(lat),
            lng: Number(lng),
            connectors: Number.isFinite(connectors) ? Number(connectors) : undefined,
          };
        }
        return null;
      })
      .filter(Boolean) as Station[];
  }
  return [];
}

function ringToLatLngs(ring: number[][]): LatLngTuple[] {
  return ring.map(([lng, lat]) => [lat, lng]);
}

export default function ClientMapInner(props: Props) {
  const center = props.initialCenter ?? [51.5074, -0.1278];
  const zoom = props.initialZoom ?? 12;
  const showHeatmap = props.showHeatmap ?? true;
  const showMarkers = props.showMarkers ?? true;
  const showCouncil = props.showCouncil ?? true;

  const heatOptions = {
    intensity: props.heatOptions?.intensity ?? 1,
    radius: props.heatOptions?.radius ?? 18,
    blur: props.heatOptions?.blur ?? 15,
  };

  const mapRef = useRef<LeafletMap | null>(null);

  const [stations, setStations] = useState<Station[]>([]);
  const [council, setCouncil] = useState<CouncilGeoJSON | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/data/ev_heat.json', { cache: 'no-store' });
        if (r.ok) {
          const json = await r.json();
          const norm = normalizeStations(json);
          if (!cancelled) setStations(norm);
          return;
        }
        const rcsv = await fetch('/data/ev_heat.csv', { cache: 'no-store' });
        if (rcsv.ok) {
          const text = await rcsv.text();
          const rows = text
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          const [header, ...data] = rows;
          const cols = header.split(',').map((s) => s.trim().toLowerCase());
          const latIdx = cols.indexOf('lat');
          const lngIdx = cols.indexOf('lng') >= 0 ? cols.indexOf('lng') : cols.indexOf('lon');
          const connIdx = cols.indexOf('connectors');

          const parsed: Station[] = data
            .map((line) => line.split(','))
            .map((arr) => {
              const lat = Number(arr[latIdx]);
              const lng = Number(arr[lngIdx]);
              const connectors =
                connIdx >= 0 && Number.isFinite(Number(arr[connIdx]))
                  ? Number(arr[connIdx])
                  : undefined;
              return Number.isFinite(lat) && Number.isFinite(lng)
                ? ({ lat, lng, connectors } as Station)
                : null;
            })
            .filter(Boolean) as Station[];

          if (!cancelled) setStations(parsed);
        }
        if (!r.ok) {
          // If JSON missing and CSV also not ok, warn once.
          if (!rcsv.ok && !cancelled) {
            // eslint-disable-next-line no-console
            console.warn('[model1-heatmap] ev_heat.json and ev_heat.csv not found; rendering base map only');
          }
        }
      } catch {
        if (!cancelled) setStations([]);
        // eslint-disable-next-line no-console
        console.warn('[model1-heatmap] Failed to load station datasets; rendering base map only');
      }
    };

    if (typeof window !== 'undefined') load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/data/council-test.geojson', { cache: 'no-store' });
        if (r.ok) {
          const gj = (await r.json()) as CouncilGeoJSON;
          if (!cancelled) setCouncil(gj);
        } else {
          if (!cancelled) setCouncil(null);
        }
      } catch {
        if (!cancelled) setCouncil(null);
      }
    };
    if (typeof window !== 'undefined') load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof props.onStationsCount === 'function') {
      props.onStationsCount(stations.length);
    }
  }, [stations.length, props]);

  const heatPoints = useMemo(
    () =>
      stations.map((s) => ({
        lat: s.lat,
        lng: s.lng,
        value: Math.max(0.5, (s.connectors ?? 1) * Math.max(0, heatOptions.intensity || 1)),
      })),
    [stations, heatOptions.intensity]
  );

  return (
    <div className="relative">
      {typeof window !== 'undefined' && (
        <MapContainer
          ref={mapRef as any}
          center={center}
          zoom={zoom}
          className="leaflet-map"
          preferCanvas
          style={{ height: 'calc(100vh - 120px)' }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <SearchControl />

          {showHeatmap && heatPoints.length > 0 && (
            <Pane name="heatmap" style={{ zIndex: 350 }}>
              <HeatmapWithScaling
                points={heatPoints}
                radius={Math.max(1, Math.round(heatOptions.radius))}
                blur={Math.max(0, Math.round(heatOptions.blur))}
              />
            </Pane>
          )}

          {showMarkers && stations.length > 0 && (
            <Pane name="markers" style={{ zIndex: 400 }}>
              {stations.map((s, i) => (
                <CircleMarker
                  key={s.id ?? i}
                  center={[s.lat, s.lng]}
                  radius={4}
                  weight={1}
                  pathOptions={{ color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.8 }}
                >
                  <Popup>
                    <div style={{ minWidth: 220 }}>
                      <strong>{s.name ?? 'EV Charging'}</strong>
                      <div>{s.address ?? '—'}</div>
                      <div>{s.postcode ?? '—'}</div>
                      <div>Source: {s.source ?? 'osm'}</div>
                      <div>Connectors: {s.connectors ?? 1}</div>
                      <div>
                        Coordinates: {s.lat.toFixed(6)}, {s.lng.toFixed(6)}
                      </div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in Google Maps
                      </a>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </Pane>
          )}

          {showCouncil && council && council.features?.length > 0 && (
            <Pane name="council" style={{ zIndex: 300 }}>
              {council.features.map((f, idx) => {
                const g = f.geometry;
                const name = f.properties?.name ?? `Area ${idx + 1}`;

                if (g.type === 'Polygon') {
                  const rings = g.coordinates as number[][][];
                  return (
                    <Polygon
                      key={`poly-${idx}`}
                      positions={rings.map(ringToLatLngs)}
                      pathOptions={{
                        color: '#0284c7',
                        weight: 2,
                        fillOpacity: 0.12,
                      }}
                    >
                      <Popup>{name}</Popup>
                    </Polygon>
                  );
                }

                if (g.type === 'MultiPolygon') {
                  const polys = g.coordinates as number[][][][];
                  return polys.map((poly, i2) => (
                    <Polygon
                      key={`mpoly-${idx}-${i2}`}
                      positions={poly.map(ringToLatLngs)}
                      pathOptions={{
                        color: '#0284c7',
                        weight: 2,
                        fillOpacity: 0.12,
                      }}
                    >
                      <Popup>{name}</Popup>
                    </Polygon>
                  ));
                }

                return null;
              })}
            </Pane>
          )}
        </MapContainer>
      )}
    </div>
  );
}


>>>>>>> 960c549 (fix(model1-heatmap): move datasets to public; client-only map with defaults; prod-safe fetch paths)
